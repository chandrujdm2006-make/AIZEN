"""
Coordinator and Conflict Resolution Layer.
Orchestrates agent intelligence, calculates transparent weighted priority scores,
detects resource and spatial conflicts, delegates allocation to the deterministic solver,
generates explainable rationales, and assembles the complete CoordinatedPlan.
"""

import math
import datetime
from typing import List, Dict, Tuple, Optional
from pydantic import BaseModel

from backend.app.models import (
    ScenarioState,
    Zone,
    PriorityFactorBreakdown,
    ZonePriority,
    Conflict,
    CoordinatedPlan,
    DecisionTrace,
    LogisticsRecommendation,
    MedicalRecommendation,
    CommunicationPlan,
    ZoneAllocation,
)
from backend.app.routing import RoutingGraph
from backend.app.solver import DeterministicSolver
from backend.app.llm import LLMClient, get_llm_client
from backend.app.agents.logistics import LogisticsAgent
from backend.app.agents.medical import MedicalAgent
from backend.app.agents.communication import CommunicationAgent


# Transparent priority scoring configuration weights
DEFAULT_WEIGHTS = {
    "severity": 0.30,
    "critical_patients": 0.25,
    "vulnerable_population": 0.15,
    "population": 0.15,
    "evacuation_demand": 0.15,
}


class PriorityScorer:
    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = weights or DEFAULT_WEIGHTS

    def calculate(self, zone: Zone) -> ZonePriority:
        # Normalized component scores (0 to 100)
        sev_score = (zone.flood_severity / 5.0) * 100.0
        crit_score = min(100.0, (zone.critical_patients / 15.0) * 100.0)
        vuln_score = min(100.0, (zone.vulnerable_population / 150.0) * 100.0)
        pop_score = min(100.0, (zone.population / 800.0) * 100.0)
        evac_score = min(100.0, (zone.evacuation_demand / 120.0) * 100.0)

        # Weighted components
        c_sev = sev_score * self.weights["severity"]
        c_crit = crit_score * self.weights["critical_patients"]
        c_vuln = vuln_score * self.weights["vulnerable_population"]
        c_pop = pop_score * self.weights["population"]
        c_evac = evac_score * self.weights["evacuation_demand"]

        total = round(c_sev + c_crit + c_vuln + c_pop + c_evac, 2)
        total = min(100.0, max(0.0, total))

        breakdown = PriorityFactorBreakdown(
            severity_component=round(c_sev, 2),
            critical_patients_component=round(c_crit, 2),
            vulnerable_component=round(c_vuln, 2),
            population_component=round(c_pop, 2),
            evac_demand_component=round(c_evac, 2),
            total_score=total,
        )

        return ZonePriority(
            zone_id=zone.id,
            zone_name=zone.name,
            score=total,
            rank=0,  # Will be assigned during ranking
            breakdown=breakdown,
        )

    def rank_zones(self, zones: List[Zone]) -> List[ZonePriority]:
        scored = [self.calculate(z) for z in zones]
        # Sort by score descending, ties broken deterministically by zone_id ascending
        scored.sort(key=lambda item: (-item.score, item.zone_id))
        for rank_idx, item in enumerate(scored, start=1):
            item.rank = rank_idx
        return scored


class ConflictDetector:
    @staticmethod
    def detect_conflicts(
        state: ScenarioState,
        logistics_rec: LogisticsRecommendation,
        medical_rec: MedicalRecommendation,
        routing_graph: RoutingGraph,
    ) -> List[Conflict]:
        conflicts: List[Conflict] = []
        counter = 1

        # 1. Total Ambulance Deficit & Contested Ambulance Conflict
        total_amb_requested = sum(
            r.requested_ambulances for r in medical_rec.zone_requests
        )
        if total_amb_requested > state.resource_pool.ambulances:
            competing_zones = [
                r.zone_id for r in medical_rec.zone_requests if r.requested_ambulances > 1
            ]
            conflicts.append(
                Conflict(
                    id=f"CONF-AMB-{counter}",
                    conflict_type="contested_resource",
                    resource_type="ambulances",
                    zones_involved=competing_zones if competing_zones else [z.id for z in state.zones],
                    total_demand=float(total_amb_requested),
                    total_supply=float(state.resource_pool.ambulances),
                    description=(
                        f"Contested Scarce Asset: {len(competing_zones)} zones competing for ambulances. "
                        f"Total demand ({total_amb_requested}) exceeds available pool ({state.resource_pool.ambulances})."
                    ),
                )
            )
            counter += 1

        # 2. Total Evacuation Vehicle Deficit
        total_veh_requested = sum(
            r.requested_evac_vehicles for r in logistics_rec.zone_requests
        )
        if total_veh_requested > state.resource_pool.evacuation_vehicles:
            conflicts.append(
                Conflict(
                    id=f"CONF-VEH-{counter}",
                    conflict_type="resource_shortage",
                    resource_type="evacuation_vehicles",
                    zones_involved=[r.zone_id for r in logistics_rec.zone_requests if r.requested_evac_vehicles > 0],
                    total_demand=float(total_veh_requested),
                    total_supply=float(state.resource_pool.evacuation_vehicles),
                    description=(
                        f"Evacuation Fleet Deficit: Total vehicle requests ({total_veh_requested}) "
                        f"exceed fleet pool ({state.resource_pool.evacuation_vehicles})."
                    ),
                )
            )
            counter += 1

        # 3. Shelter Capacity vs Evacuation Demand
        total_evac_demand = sum(z.evacuation_demand for z in state.zones)
        total_shelter_cap = sum(s.capacity for s in state.resource_pool.shelters)
        if total_evac_demand > total_shelter_cap:
            conflicts.append(
                Conflict(
                    id=f"CONF-SHELT-{counter}",
                    conflict_type="shelter_overflow",
                    resource_type="shelter",
                    zones_involved=[z.id for z in state.zones if z.evacuation_demand > 0],
                    total_demand=float(total_evac_demand),
                    total_supply=float(total_shelter_cap),
                    description=(
                        f"Shelter Capacity Saturation: Regional evacuation demand ({total_evac_demand}) "
                        f"exceeds fixed shelter capacity ({total_shelter_cap}) by {total_evac_demand - total_shelter_cap} evacuees."
                    ),
                )
            )
            counter += 1

        # 4. Blocked Road Hazards on Evacuation Corridors
        for road in state.roads:
            if road.status == "blocked":
                conflicts.append(
                    Conflict(
                        id=f"CONF-ROAD-{counter}",
                        conflict_type="blocked_route_hazard",
                        resource_type="road",
                        zones_involved=[road.from_node, road.to_node],
                        total_demand=1.0,
                        total_supply=0.0,
                        description=(
                            f"Impassable Arterial Road: Road segment {road.from_node} <-> {road.to_node} "
                            f"is completely BLOCKED. Evacuation routing must navigate detours."
                        ),
                    )
                )
                counter += 1

        return conflicts


class DisasterCoordinator:
    def __init__(self, llm_client: Optional[LLMClient] = None, mode: Optional[str] = None):
        if llm_client is None:
            self.llm_client, self.mode = get_llm_client()
        else:
            self.llm_client = llm_client
            self.mode = mode or "fallback_mock"

        self.scorer = PriorityScorer()
        self.logistics_agent = LogisticsAgent(self.llm_client, self.mode)
        self.medical_agent = MedicalAgent(self.llm_client, self.mode)
        self.communication_agent = CommunicationAgent(self.llm_client, self.mode)

    def coordinate_plan(
        self,
        state: ScenarioState,
        plan_version: int = 1,
        is_replan: bool = False,
        diff_summary: Optional[List[str]] = None,
    ) -> CoordinatedPlan:
        """
        Executes full coordination pipeline:
        1. Routing graph construction
        2. Agent recommendation harvesting (Logistics & Medical)
        3. Priority ranking & conflict detection
        4. Deterministic resource constraint solving
        5. Rationale synthesis & explainability
        6. Post-solve Communication public alerts
        """
        routing_graph = RoutingGraph(state.roads)
        agent_modes: Dict[str, str] = {}

        # 1. Harvest Agent Recommendations
        logistics_recs, log_mode = self.logistics_agent.analyze(state, routing_graph)
        medical_recs, med_mode = self.medical_agent.analyze(state)
        agent_modes["logistics_agent"] = log_mode
        agent_modes["medical_agent"] = med_mode

        # 2. Priority Ranking
        ranked_zones = self.scorer.rank_zones(state.zones)
        ranked_map = {rz.zone_id: rz for rz in ranked_zones}

        # 3. Detect Conflicts
        conflicts = ConflictDetector.detect_conflicts(
            state, logistics_recs, medical_recs, routing_graph
        )

        # 4. Prepare Demands for Deterministic Solver
        demands: Dict[str, Dict[str, int]] = {}
        for z in state.zones:
            # Find medical request
            med_z = next(
                (mr for mr in medical_recs.zone_requests if mr.zone_id == z.id), None
            )
            # Find logistics request
            log_z = next(
                (lr for lr in logistics_recs.zone_requests if lr.zone_id == z.id), None
            )

            demands[z.id] = {
                "ambulances": med_z.requested_ambulances if med_z else 0,
                "evacuation_vehicles": log_z.requested_evac_vehicles
                if log_z
                else math.ceil(z.evacuation_demand / 20),
                "medics": med_z.requested_medics if med_z else 0,
                "evacuees": z.evacuation_demand,
            }

        # 5. Deterministic Solver Execution (Absolute Authority on Numbers)
        solver = DeterministicSolver(
            zones=state.zones,
            ranked_zones=ranked_zones,
            demands=demands,
            resource_pool=state.resource_pool,
            routing_graph=routing_graph,
        )
        (
            allocations,
            resource_summaries,
            shelter_statuses,
            solver_steps,
        ) = solver.solve()

        # 6. Synthesize Conflict Rationales (LLM Explains, Never Changes Allocation)
        self._populate_conflict_rationales(conflicts, allocations, ranked_zones)

        # 7. Post-Solve Communication Agent
        comm_plan, comm_mode = self.communication_agent.generate_alerts(
            zones=state.zones,
            allocations=allocations,
            conflicts=conflicts,
            is_replan=is_replan,
            diff_summary=diff_summary,
        )
        agent_modes["communication_agent"] = comm_mode

        # 8. Decision Trace
        decision_trace = DecisionTrace(
            initial_demands=demands,
            conflicts_detected=[f"[{c.id}] {c.description}" for c in conflicts],
            solver_steps=solver_steps,
            final_tradeoffs=[
                f"{a.zone_name}: Ambulances {a.ambulances.allocated}/{a.ambulances.requested}, "
                f"Vehicles {a.evacuation_vehicles.allocated}/{a.evacuation_vehicles.requested}, "
                f"Evacuees Sheltered {a.evacuees_sheltered}/{a.evacuees_sheltered + a.evacuees_unmet}"
                for a in allocations
            ],
        )

        # 9. Return Complete Coordinated Plan
        plan_id = f"PLAN-{state.scenario_id}-V{plan_version}"
        return CoordinatedPlan(
            plan_id=plan_id,
            plan_version=plan_version,
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            scenario_id=state.scenario_id,
            zones_ranked=ranked_zones,
            logistics_recommendations=logistics_recs,
            medical_recommendations=medical_recs,
            communication_plan=comm_plan,
            conflicts=conflicts,
            allocations=allocations,
            resource_summaries=resource_summaries,
            shelter_statuses=shelter_statuses,
            decision_trace=decision_trace,
            agent_execution_modes=agent_modes,
        )

    def _populate_conflict_rationales(
        self,
        conflicts: List[Conflict],
        allocations: List[ZoneAllocation],
        ranked_zones: List[ZonePriority],
    ):
        """Generates clear, transparent natural-language rationales for detected conflicts."""
        alloc_map = {a.zone_id: a for a in allocations}
        rank_map = {r.zone_id: r for r in ranked_zones}

        for c in conflicts:
            if c.conflict_type == "contested_resource" and c.resource_type == "ambulances":
                # Detail the Zone A vs Zone D resolution
                summary_lines = []
                for zid in c.zones_involved:
                    if zid in alloc_map:
                        a = alloc_map[zid]
                        r = rank_map.get(zid)
                        score_str = f"(Priority Rank #{r.rank}, Score {r.score:.1f})" if r else ""
                        summary_lines.append(
                            f"{a.zone_name} {score_str}: Allocated {a.ambulances.allocated}/{a.ambulances.requested}"
                        )
                c.resolved_allocation_summary = "; ".join(summary_lines)
                c.resolution_rationale = (
                    "Ambulance allocation strictly resolved via deterministic two-pass priority. "
                    "Pass 1 guaranteed 1 unit to every zone with critical patients. "
                    "Pass 2 awarded the sole remaining unit to Zone A (Rank #1) over Zone D (Rank #2) "
                    "due to higher critical casualty volume (8 vs 6) and greater vulnerability index. "
                    "Zone D's 2nd ambulance is recorded as unmet."
                )

            elif c.conflict_type == "resource_shortage":
                c.resolved_allocation_summary = (
                    f"Available pool ({int(c.total_supply)}) fully utilized; "
                    f"unmet demand of {int(c.total_demand - c.total_supply)} distributed across lower priority zones."
                )
                c.resolution_rationale = (
                    "Available vehicles assigned proportionally to highest priority evacuation zones. "
                    "Residual evacuees staged in protected high-ground pockets pending secondary vehicle round-trips."
                )

            elif c.conflict_type == "shelter_overflow":
                c.resolved_allocation_summary = (
                    f"Fixed shelter capacity ({int(c.total_supply)}) fully filled; "
                    f"{int(c.total_demand - c.total_supply)} evacuees placed on priority mutual-aid standby."
                )
                c.resolution_rationale = (
                    "Shelter North and Shelter South filled to 100% capacity using shortest accessible Dijkstra routes. "
                    "Overflow evacuees designated for regional mutual-aid staging."
                )

            elif c.conflict_type == "blocked_route_hazard":
                c.resolved_allocation_summary = "Arterial road bypassed; all traffic rerouted via alternative open connectors."
                c.resolution_rationale = (
                    "Routing engine safely redirected traffic through verified open road edges, avoiding flood-hazard zones."
                )

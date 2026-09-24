"""
In-memory state management and versioned plan history with differential analysis.
Handles baseline loading, dynamic zone addition, commander approvals, and diff calculation.
"""

import json
import math
from pathlib import Path
from typing import List, Optional, Dict
import datetime


from backend.app.models import (
    ScenarioState,
    Zone,
    RoadEdge,
    CoordinatedPlan,
    ReplanDiff,
    ZoneAllocationDiff,
    ZoneAllocation,
    ResourceAllocation,
    ResourceUsageSummary,
    ShelterStatus,
    DecisionTrace,
    LogisticsRecommendation,
    MedicalRecommendation,
    CommunicationPlan,
    ZoneAlert,
    ZoneControlUpdate,
    GlobalPoolControlUpdate,
    ZoneManualAllocation,
    ControlPanelConflictWarning,
)



class StateManager:
    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or (Path(__file__).parent.parent / "data")
        self.current_state: Optional[ScenarioState] = None
        self.plan_history: List[CoordinatedPlan] = []
        self.load_base_scenario()

    def load_base_scenario(self) -> ScenarioState:
        """Loads base scenario JSON from disk."""
        base_path = self.data_dir / "scenario_base.json"
        with open(base_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
        self.current_state = ScenarioState(**raw_data)
        return self.current_state

    def reset_to_base(self) -> ScenarioState:
        """Resets scenario state to baseline and clears plan history."""
        self.load_base_scenario()
        self.plan_history.clear()
        return self.current_state

    def get_current_state(self) -> ScenarioState:
        if self.current_state is None:
            self.load_base_scenario()
        return self.current_state

    def add_zone(self, zone: Zone, new_roads: List[RoadEdge]) -> ScenarioState:
        """Merges new zone and road edges into the active scenario state."""
        state = self.get_current_state()

        # Check if zone already exists, update or append
        existing_zone_idx = next(
            (i for i, z in enumerate(state.zones) if z.id == zone.id), None
        )
        if existing_zone_idx is not None:
            state.zones[existing_zone_idx] = zone
        else:
            state.zones.append(zone)

        # Append unique new roads
        for road in new_roads:
            already_exists = any(
                (r.from_node == road.from_node and r.to_node == road.to_node)
                or (r.from_node == road.to_node and r.to_node == road.from_node)
                for r in state.roads
            )
            if not already_exists:
                state.roads.append(road)

        return state

    def save_plan(self, plan: CoordinatedPlan):
        self.plan_history.append(plan)

    def get_latest_plan(self) -> Optional[CoordinatedPlan]:
        return self.plan_history[-1] if self.plan_history else None

    def get_plan_history(self) -> List[CoordinatedPlan]:
        return self.plan_history

    def approve_plan(
        self, plan_id: str, commander_name: str, notes: Optional[str] = None
    ) -> Optional[CoordinatedPlan]:
        """Approves a plan by version ID, recording commander signature and timestamp."""
        for plan in self.plan_history:
            if plan.plan_id == plan_id or str(plan.plan_version) == plan_id:
                plan.is_approved = True
                plan.approved_by = commander_name
                plan.approved_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                return plan
        return None

    def compute_replan_diff(
        self, old_plan: CoordinatedPlan, new_plan: CoordinatedPlan
    ) -> ReplanDiff:
        """Computes granular allocation and rank shifts between two response plan versions."""
        old_alloc_map = {a.zone_id: a for a in old_plan.allocations}
        new_alloc_map = {a.zone_id: a for a in new_plan.allocations}

        old_rank_map = {rz.zone_id: rz.rank for rz in old_plan.zones_ranked}
        new_rank_map = {rz.zone_id: rz.rank for rz in new_plan.zones_ranked}

        newly_added = [
            zid for zid in new_alloc_map.keys() if zid not in old_alloc_map
        ]
        diffs: List[ZoneAllocationDiff] = []
        summary_lines: List[str] = []

        if newly_added:
            summary_lines.append(
                f"Emergency event: Zone(s) {', '.join(newly_added).upper()} injected into active operations."
            )

        for zid, new_a in new_alloc_map.items():
            old_a = old_alloc_map.get(zid)
            old_rank = old_rank_map.get(zid)
            new_rank = new_rank_map.get(zid, 0)

            if old_a is None:
                # Newly added zone
                diff = ZoneAllocationDiff(
                    zone_id=zid,
                    zone_name=new_a.zone_name,
                    ambulance_diff=new_a.ambulances.allocated,
                    vehicle_diff=new_a.evacuation_vehicles.allocated,
                    medic_diff=new_a.medics.allocated,
                    evacuee_diff=new_a.evacuees_sheltered,
                    priority_rank_old=None,
                    priority_rank_new=new_rank,
                    reason=f"New flash flood sector inserted at Priority Rank #{new_rank}.",
                )
                diffs.append(diff)
                summary_lines.append(
                    f"{new_a.zone_name} claimed {new_a.ambulances.allocated} ambulance(s) and {new_a.evacuation_vehicles.allocated} vehicle(s)."
                )
            else:
                amb_diff = new_a.ambulances.allocated - old_a.ambulances.allocated
                veh_diff = (
                    new_a.evacuation_vehicles.allocated
                    - old_a.evacuation_vehicles.allocated
                )
                med_diff = new_a.medics.allocated - old_a.medics.allocated
                evac_diff = new_a.evacuees_sheltered - old_a.evacuees_sheltered

                reason_parts = []
                if amb_diff < 0:
                    reason_parts.append(
                        f"Relinquished {-amb_diff} ambulance(s) to higher-priority sector"
                    )
                elif amb_diff > 0:
                    reason_parts.append(f"Gained {amb_diff} ambulance(s)")

                if veh_diff < 0:
                    reason_parts.append(f"Lost {-veh_diff} evac vehicle(s)")
                elif veh_diff > 0:
                    reason_parts.append(f"Gained {veh_diff} vehicle(s)")

                if old_rank != new_rank:
                    reason_parts.append(f"Rank shifted #{old_rank} -> #{new_rank}")

                diff = ZoneAllocationDiff(
                    zone_id=zid,
                    zone_name=new_a.zone_name,
                    ambulance_diff=amb_diff,
                    vehicle_diff=veh_diff,
                    medic_diff=med_diff,
                    evacuee_diff=evac_diff,
                    priority_rank_old=old_rank,
                    priority_rank_new=new_rank,
                    reason="; ".join(reason_parts) if reason_parts else "Allocations unchanged",
                )
                diffs.append(diff)

                if amb_diff != 0 or veh_diff != 0 or old_rank != new_rank:
                    summary_lines.append(
                        f"{new_a.zone_name}: {diff.reason}"
                    )

        return ReplanDiff(
            old_version=old_plan.plan_version,
            new_version=new_plan.plan_version,
            newly_added_zones=newly_added,
            allocation_diffs=diffs,
            summary_of_changes=summary_lines,
        )

    def get_all_zones_including_potential(self) -> List[Zone]:
        """Returns active zones plus potential zones (Zone E) so all A, B, C, D, E are visible."""
        state = self.get_current_state()
        zones_dict = {z.id: z.model_copy() for z in state.zones}

        if "zone_e" not in zones_dict:
            zone_e_path = self.data_dir / "scenario_zone_e.json"
            if zone_e_path.exists():
                with open(zone_e_path, "r", encoding="utf-8") as f:
                    e_data = json.load(f)
                z_e = Zone(**e_data["zone"])
                zones_dict["zone_e"] = z_e

        # Compute vulnerable_percent for display if not set
        all_zones = list(zones_dict.values())
        for z in all_zones:
            if z.vulnerable_percent is None and z.population > 0:
                z.vulnerable_percent = round((z.vulnerable_population / z.population) * 100.0, 1)

        # Sort alphabetically by ID (zone_a, zone_b, zone_c, zone_d, zone_e)
        all_zones.sort(key=lambda z: z.id)
        return all_zones

    def update_from_control_panel(
        self,
        zones_update: List[ZoneControlUpdate],
        pool_update: GlobalPoolControlUpdate,
    ) -> ScenarioState:
        """Applies dynamic adjustments to zone demographics, priority overrides, and resource pools."""
        state = self.get_current_state()

        # Update or add zones
        for zu in zones_update:
            existing_zone = next((z for z in state.zones if z.id == zu.id), None)
            vuln_pop = round(zu.population * (zu.vulnerable_percent / 100.0))

            if existing_zone:
                existing_zone.name = zu.name
                existing_zone.population = zu.population
                existing_zone.evacuation_demand = zu.evacuation_demand
                existing_zone.injured = zu.injured
                existing_zone.critical_patients = zu.critical_patients
                existing_zone.flood_severity = zu.flood_severity
                existing_zone.vulnerable_percent = zu.vulnerable_percent
                existing_zone.vulnerable_population = vuln_pop
                existing_zone.priority_override = zu.priority_override
                existing_zone.is_scale_10 = True
            else:
                # If zone_e or new zone being activated
                if zu.id == "zone_e":
                    zone_e_path = self.data_dir / "scenario_zone_e.json"
                    new_roads = []
                    if zone_e_path.exists():
                        with open(zone_e_path, "r", encoding="utf-8") as f:
                            e_data = json.load(f)
                        new_roads = [RoadEdge(**r) for r in e_data.get("new_roads", [])]
                    new_z = Zone(
                        id=zu.id,
                        name=zu.name,
                        population=zu.population,
                        flood_severity=zu.flood_severity,
                        injured=zu.injured,
                        critical_patients=zu.critical_patients,
                        vulnerable_population=vuln_pop,
                        evacuation_demand=zu.evacuation_demand,
                        x=340.0,
                        y=300.0,
                        vulnerable_percent=zu.vulnerable_percent,
                        priority_override=zu.priority_override,
                        is_scale_10=True,
                    )
                    self.add_zone(new_z, new_roads)
                else:
                    new_z = Zone(
                        id=zu.id,
                        name=zu.name,
                        population=zu.population,
                        flood_severity=zu.flood_severity,
                        injured=zu.injured,
                        critical_patients=zu.critical_patients,
                        vulnerable_population=vuln_pop,
                        evacuation_demand=zu.evacuation_demand,
                        x=250.0,
                        y=250.0,
                        vulnerable_percent=zu.vulnerable_percent,
                        priority_override=zu.priority_override,
                        is_scale_10=True,
                    )
                    state.zones.append(new_z)

        # Update resource pool
        state.resource_pool.ambulances = pool_update.ambulances
        state.resource_pool.evacuation_vehicles = pool_update.evacuation_vehicles
        state.resource_pool.medics = pool_update.medics

        # Proportionally adjust shelter capacity if total changed
        current_total_shelter = sum(s.capacity for s in state.resource_pool.shelters)
        if pool_update.shelter_capacity > 0 and current_total_shelter > 0:
            ratio = pool_update.shelter_capacity / current_total_shelter
            for s in state.resource_pool.shelters:
                s.capacity = max(10, round(s.capacity * ratio))
        elif pool_update.shelter_capacity > 0 and current_total_shelter == 0:
            if state.resource_pool.shelters:
                per_s = pool_update.shelter_capacity // len(state.resource_pool.shelters)
                for s in state.resource_pool.shelters:
                    s.capacity = per_s

        return state

    def check_control_panel_conflicts(
        self,
        manual_allocations: Optional[List[ZoneManualAllocation]] = None,
    ) -> List[ControlPanelConflictWarning]:
        """Validates hard constraints, unmet demands, and allocation impossibilities."""
        state = self.get_current_state()
        warnings: List[ControlPanelConflictWarning] = []
        pool = state.resource_pool

        # 1. Total pool impossibility checks
        total_evac_demand = sum(z.evacuation_demand for z in state.zones)
        total_evac_capacity = pool.evacuation_vehicles * pool.vehicle_passenger_capacity
        if total_evac_demand > total_evac_capacity:
            warnings.append(ControlPanelConflictWarning(
                type="warning",
                resource_or_zone="evacuation_vehicles",
                message=f"Global evacuation deficit: {total_evac_demand} evacuees exceed total fleet capacity ({total_evac_capacity} seats across {pool.evacuation_vehicles} vehicles).",
                details=f"Shortage of {total_evac_demand - total_evac_capacity} seats. Additional {math.ceil((total_evac_demand - total_evac_capacity) / 20)} vehicles needed.",
            ))

        total_critical = sum(z.critical_patients for z in state.zones)
        total_amb_transport = pool.ambulances * 2
        if total_critical > total_amb_transport:
            warnings.append(ControlPanelConflictWarning(
                type="error",
                resource_or_zone="ambulances",
                message=f"Critical ambulance deficit: {total_critical} critical casualties require urgent hospital transport, but {pool.ambulances} ambulances can only transport {total_amb_transport}.",
                details=f"At least {math.ceil((total_critical - total_amb_transport) / 2)} more ambulances required to prevent triage mortality.",
            ))

        # 2. Manual allocation constraint validations
        if manual_allocations:
            alloc_amb = sum(a.assigned_ambulances for a in manual_allocations)
            alloc_veh = sum(a.assigned_evacuation_vehicles for a in manual_allocations)
            alloc_med = sum(a.assigned_medics for a in manual_allocations)
            alloc_she = sum(a.assigned_shelter_spaces for a in manual_allocations)
            total_shelter_cap = sum(s.capacity for s in pool.shelters)

            if alloc_amb > pool.ambulances:
                warnings.append(ControlPanelConflictWarning(
                    type="error",
                    resource_or_zone="ambulances",
                    message=f"Constraint Violation: {alloc_amb} ambulances allocated, exceeding global pool of {pool.ambulances} units!",
                    details=f"Over-allocation by {alloc_amb - pool.ambulances} ambulances.",
                ))
            if alloc_veh > pool.evacuation_vehicles:
                warnings.append(ControlPanelConflictWarning(
                    type="error",
                    resource_or_zone="evacuation_vehicles",
                    message=f"Constraint Violation: {alloc_veh} evacuation vehicles allocated, exceeding global pool of {pool.evacuation_vehicles} units!",
                    details=f"Over-allocation by {alloc_veh - pool.evacuation_vehicles} vehicles.",
                ))
            if alloc_med > pool.medics:
                warnings.append(ControlPanelConflictWarning(
                    type="error",
                    resource_or_zone="medics",
                    message=f"Constraint Violation: {alloc_med} medics allocated, exceeding global pool of {pool.medics} personnel!",
                    details=f"Over-allocation by {alloc_med - pool.medics} medics.",
                ))
            if alloc_she > total_shelter_cap:
                warnings.append(ControlPanelConflictWarning(
                    type="error",
                    resource_or_zone="shelter",
                    message=f"Constraint Violation: {alloc_she} shelter spaces assigned, exceeding total capacity of {total_shelter_cap} beds!",
                    details=f"Over-allocation by {alloc_she - total_shelter_cap} shelter spaces.",
                ))

            # Per-zone unmet demand warnings
            zone_map = {z.id: z for z in state.zones}
            for a in manual_allocations:
                z = zone_map.get(a.zone_id)
                if not z:
                    continue
                # Critical casualties vs ambulances
                if z.critical_patients > (a.assigned_ambulances * 2):
                    unmet_crit = z.critical_patients - (a.assigned_ambulances * 2)
                    warnings.append(ControlPanelConflictWarning(
                        type="warning",
                        resource_or_zone=z.name,
                        message=f"{z.name}: {unmet_crit} critical patients left unassigned ({a.assigned_ambulances} ambulances transport {a.assigned_ambulances * 2} of {z.critical_patients}).",
                    ))
                # Evacuation demand vs vehicles
                veh_cap = a.assigned_evacuation_vehicles * pool.vehicle_passenger_capacity
                if z.evacuation_demand > veh_cap:
                    unmet_evac = z.evacuation_demand - veh_cap
                    warnings.append(ControlPanelConflictWarning(
                        type="warning",
                        resource_or_zone=z.name,
                        message=f"{z.name}: {unmet_evac} evacuees have no transport assigned ({a.assigned_evacuation_vehicles} vehicles carry {veh_cap} of {z.evacuation_demand}).",
                    ))

        return warnings


# Global singleton instance for easy import across endpoints
global_state_manager = StateManager()


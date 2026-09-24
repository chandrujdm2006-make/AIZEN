"""
Deterministic Resource Constraint Solver.
Pure Python, zero-LLM, strictly deterministic resource allocation with guaranteed invariants.
Implements two-pass priority allocation for scarce assets and capacity-constrained shelter routing.
"""

import math
from typing import List, Dict, Tuple, Optional, Any
from backend.app.models import (
    Zone,
    Shelter,
    ResourcePool,
    ZonePriority,
    ResourceAllocation,
    ShelterEvacuationAssignment,
    ZoneAllocation,
    SolverStep,
    ShelterStatus,
    ResourceUsageSummary,
)
from backend.app.routing import RoutingGraph, RouteResult


class SolverInvariantViolationError(Exception):
    """Raised if any mathematical constraint is violated."""
    pass


class DeterministicSolver:
    def __init__(
        self,
        zones: List[Zone],
        ranked_zones: List[ZonePriority],
        demands: Dict[str, Dict[str, int]],
        resource_pool: ResourcePool,
        routing_graph: RoutingGraph,
    ):
        self.zones = {z.id: z for z in zones}
        # Sort ranked_zones strictly by (score descending, zone_id ascending) for determinism
        self.ranked_zones = sorted(
            ranked_zones,
            key=lambda z: (-round(z.score, 4), z.zone_id)
        )
        self.demands = demands
        self.pool = resource_pool
        self.routing_graph = routing_graph

        # Working state
        self.remaining_ambulances = self.pool.ambulances
        self.remaining_vehicles = self.pool.evacuation_vehicles
        self.remaining_medics = self.pool.medics

        # Deep copy shelter capacities
        self.shelters = {
            s.id: Shelter(
                id=s.id,
                name=s.name,
                capacity=s.capacity,
                current_occupancy=s.current_occupancy,
                x=s.x,
                y=s.y,
            )
            for s in self.pool.shelters
        }

        self.solver_steps: List[SolverStep] = []
        self.step_counter = 0

    def _log_step(
        self,
        action_type: str,
        description: str,
        zone_id: Optional[str] = None,
        resource: Optional[str] = None,
        quantity: Optional[int] = None,
        remaining_pool: Optional[int] = None,
    ):
        self.step_counter += 1
        self.solver_steps.append(
            SolverStep(
                step_number=self.step_counter,
                action_type=action_type,
                description=description,
                zone_id=zone_id,
                resource=resource,
                quantity=quantity,
                remaining_pool=remaining_pool,
            )
        )

    def solve(self) -> Tuple[List[ZoneAllocation], List[ResourceUsageSummary], List[ShelterStatus], List[SolverStep]]:
        """
        Executes the two-pass allocation and shelter assignment pipeline.
        Returns:
            - Zone allocations
            - Resource usage summaries
            - Shelter status summaries
            - Ordered solver step logs
        """
        self._log_step(
            action_type="SOLVER_INIT",
            description=f"Initialized deterministic solver. Pool: {self.remaining_ambulances} ambulances, {self.remaining_vehicles} evac vehicles, {self.remaining_medics} medics.",
        )

        # 1. Shelter Assignment & Evacuation Demand Handling
        zone_shelter_assignments, zone_evac_stats = self._assign_shelters()

        # 2. Allocate Evacuation Vehicles (Two-Pass)
        vehicle_allocations = self._allocate_two_pass(
            resource_name="evacuation_vehicles",
            pool_getter=lambda: self.remaining_vehicles,
            pool_setter=lambda v: setattr(self, "remaining_vehicles", v),
            demand_key="evacuation_vehicles",
            critical_criteria=lambda z: (z.evacuation_demand > 0 and z.flood_severity >= 3),
        )

        # 3. Allocate Ambulances (Two-Pass)
        ambulance_allocations = self._allocate_two_pass(
            resource_name="ambulances",
            pool_getter=lambda: self.remaining_ambulances,
            pool_setter=lambda v: setattr(self, "remaining_ambulances", v),
            demand_key="ambulances",
            critical_criteria=lambda z: (z.critical_patients >= 5 or z.flood_severity >= 4),
        )

        # 4. Allocate Medics (Two-Pass)
        medic_allocations = self._allocate_two_pass(
            resource_name="medics",
            pool_getter=lambda: self.remaining_medics,
            pool_setter=lambda v: setattr(self, "remaining_medics", v),
            demand_key="medics",
            critical_criteria=lambda z: (z.injured >= 15 or z.critical_patients >= 3),
        )

        # 5. Assemble Zone Allocations
        zone_allocations: List[ZoneAllocation] = []
        for rz in self.ranked_zones:
            zid = rz.zone_id
            z = self.zones[zid]
            amb_alloc = ambulance_allocations[zid]
            veh_alloc = vehicle_allocations[zid]
            med_alloc = medic_allocations[zid]
            evac_stats = zone_evac_stats[zid]
            assignments = zone_shelter_assignments[zid]

            rationale_parts = []
            if amb_alloc.unmet > 0:
                rationale_parts.append(
                    f"Ambulance shortage: received {amb_alloc.allocated}/{amb_alloc.requested} requested due to priority cap"
                )
            else:
                rationale_parts.append(f"Ambulances fulfilled ({amb_alloc.allocated}/{amb_alloc.requested})")

            if veh_alloc.unmet > 0:
                rationale_parts.append(f"Vehicles constrained: {veh_alloc.allocated}/{veh_alloc.requested}")
            if evac_stats["unmet"] > 0:
                rationale_parts.append(f"Shelter overflow: {evac_stats['unmet']} evacuees pending capacity")

            zone_allocations.append(
                ZoneAllocation(
                    zone_id=zid,
                    zone_name=z.name,
                    priority_rank=rz.rank,
                    priority_score=rz.score,
                    ambulances=amb_alloc,
                    evacuation_vehicles=veh_alloc,
                    medics=med_alloc,
                    evacuees_sheltered=evac_stats["sheltered"],
                    evacuees_unmet=evac_stats["unmet"],
                    shelter_assignments=assignments,
                    rationale="; ".join(rationale_parts),
                )
            )

        # 6. Resource Summaries
        resource_summaries = self._calculate_summaries(
            ambulance_allocations, vehicle_allocations, medic_allocations
        )

        # 7. Shelter Status Summaries
        shelter_statuses = [
            ShelterStatus(
                id=s.id,
                name=s.name,
                capacity=s.capacity,
                allocated_count=s.current_occupancy,
                remaining_capacity=max(0, s.capacity - s.current_occupancy),
                saturation_percentage=round(
                    (s.current_occupancy / s.capacity) * 100.0, 1
                ) if s.capacity > 0 else 0.0,
            )
            for s in self.shelters.values()
        ]

        # 8. Assert strict invariants
        self.verify_invariants(zone_allocations, resource_summaries, shelter_statuses)

        return zone_allocations, resource_summaries, shelter_statuses, self.solver_steps

    def _assign_shelters(
        self,
    ) -> Tuple[Dict[str, List[ShelterEvacuationAssignment]], Dict[str, Dict[str, int]]]:
        """
        Assigns evacuees to nearest accessible shelters based on road distances and remaining capacity.
        Splits evacuees across shelters if nearest reaches capacity.
        """
        assignments: Dict[str, List[ShelterEvacuationAssignment]] = {
            rz.zone_id: [] for rz in self.ranked_zones
        }
        evac_stats: Dict[str, Dict[str, int]] = {
            rz.zone_id: {"sheltered": 0, "unmet": 0} for rz in self.ranked_zones
        }

        shelter_list = list(self.shelters.values())

        for rz in self.ranked_zones:
            zid = rz.zone_id
            z = self.zones[zid]
            total_needed = z.evacuation_demand
            remaining_to_shelter = total_needed

            # Get accessible shelter routes sorted by travel time
            routes = self.routing_graph.find_shelter_routes(zid, shelter_list)

            if not routes:
                self._log_step(
                    action_type="SHELTER_UNREACHABLE",
                    description=f"CRITICAL: No accessible road route from {z.name} to any shelter. All {total_needed} evacuees unmet.",
                    zone_id=zid,
                )
                evac_stats[zid]["unmet"] = total_needed
                continue

            for shelter_candidate, route in routes:
                if remaining_to_shelter <= 0:
                    break

                shelter = self.shelters[shelter_candidate.id]
                avail_cap = shelter.capacity - shelter.current_occupancy

                if avail_cap <= 0:
                    continue

                assign_count = min(remaining_to_shelter, avail_cap)
                shelter.current_occupancy += assign_count
                remaining_to_shelter -= assign_count
                evac_stats[zid]["sheltered"] += assign_count

                assignments[zid].append(
                    ShelterEvacuationAssignment(
                        shelter_id=shelter.id,
                        shelter_name=shelter.name,
                        evacuees_assigned=assign_count,
                        route_path=route.path,
                        distance_km=route.total_distance_km,
                        travel_minutes=route.total_travel_minutes,
                    )
                )

                self._log_step(
                    action_type="SHELTER_ASSIGN",
                    description=(
                        f"Assigned {assign_count} evacuees from {z.name} to {shelter.name} "
                        f"via path {' -> '.join(route.path)} ({route.total_travel_minutes} min). "
                        f"Shelter occupancy: {shelter.current_occupancy}/{shelter.capacity}."
                    ),
                    zone_id=zid,
                    resource="shelter",
                    quantity=assign_count,
                    remaining_pool=shelter.capacity - shelter.current_occupancy,
                )

            if remaining_to_shelter > 0:
                evac_stats[zid]["unmet"] = remaining_to_shelter
                self._log_step(
                    action_type="SHELTER_OVERFLOW",
                    description=(
                        f"All reachable shelters full! {remaining_to_shelter} evacuees from {z.name} "
                        f"cannot be accommodated and are recorded as UNMET."
                    ),
                    zone_id=zid,
                    resource="shelter",
                    quantity=remaining_to_shelter,
                    remaining_pool=0,
                )

        return assignments, evac_stats

    def _allocate_two_pass(
        self,
        resource_name: str,
        pool_getter,
        pool_setter,
        demand_key: str,
        critical_criteria,
    ) -> Dict[str, ResourceAllocation]:
        """
        Two-pass deterministic priority allocator.
        Pass 1: Guarantees 1 unit to every zone with critical need in priority order.
        Pass 2: Allocates remaining units in priority order until demand met or pool empty.
        """
        allocations: Dict[str, int] = {rz.zone_id: 0 for rz in self.ranked_zones}
        requested_map: Dict[str, int] = {
            rz.zone_id: self.demands.get(rz.zone_id, {}).get(demand_key, 0)
            for rz in self.ranked_zones
        }

        # --- PASS 1: Guarantee 1 unit to critical need zones ---
        for rz in self.ranked_zones:
            pool = pool_getter()
            if pool <= 0:
                break

            zid = rz.zone_id
            z = self.zones[zid]
            req = requested_map[zid]

            if req > 0 and critical_criteria(z):
                allocations[zid] += 1
                pool_setter(pool - 1)
                self._log_step(
                    action_type=f"PASS_1_{resource_name.upper()}",
                    description=(
                        f"Pass 1 [{resource_name}]: Guaranteed 1 unit to {z.name} (Rank #{rz.rank}, "
                        f"Score {rz.score:.1f}) for critical need. Pool remaining: {pool_getter()}."
                    ),
                    zone_id=zid,
                    resource=resource_name,
                    quantity=1,
                    remaining_pool=pool_getter(),
                )

        # --- PASS 2: Priority allocation of remaining units ---
        for rz in self.ranked_zones:
            pool = pool_getter()
            if pool <= 0:
                break

            zid = rz.zone_id
            z = self.zones[zid]
            req = requested_map[zid]
            already_alloc = allocations[zid]
            needed = req - already_alloc

            if needed > 0:
                grant = min(needed, pool)
                allocations[zid] += grant
                pool_setter(pool - grant)
                self._log_step(
                    action_type=f"PASS_2_{resource_name.upper()}",
                    description=(
                        f"Pass 2 [{resource_name}]: Allocated {grant} unit(s) to {z.name} "
                        f"(Rank #{rz.rank}, Score {rz.score:.1f}). Total allocated: {allocations[zid]}/{req}. "
                        f"Pool remaining: {pool_getter()}."
                    ),
                    zone_id=zid,
                    resource=resource_name,
                    quantity=grant,
                    remaining_pool=pool_getter(),
                )

        # Record unmet steps for explainability
        for rz in self.ranked_zones:
            zid = rz.zone_id
            req = requested_map[zid]
            alloc = allocations[zid]
            unmet = max(0, req - alloc)
            if unmet > 0:
                self._log_step(
                    action_type=f"UNMET_{resource_name.upper()}",
                    description=(
                        f"Resource deficit [{resource_name}]: {self.zones[zid].name} requested {req}, "
                        f"allocated {alloc}, unmet {unmet} due to scarce pool depletion."
                    ),
                    zone_id=zid,
                    resource=resource_name,
                    quantity=unmet,
                    remaining_pool=0,
                )

        result: Dict[str, ResourceAllocation] = {}
        for rz in self.ranked_zones:
            zid = rz.zone_id
            req = requested_map[zid]
            alloc = allocations[zid]
            result[zid] = ResourceAllocation(
                requested=req,
                allocated=alloc,
                unmet=max(0, req - alloc),
            )

        return result

    def _calculate_summaries(
        self,
        ambulance_allocations: Dict[str, ResourceAllocation],
        vehicle_allocations: Dict[str, ResourceAllocation],
        medic_allocations: Dict[str, ResourceAllocation],
    ) -> List[ResourceUsageSummary]:
        def summarize(name: str, pool_total: int, alloc_map: Dict[str, ResourceAllocation]):
            total_alloc = sum(a.allocated for a in alloc_map.values())
            total_unmet = sum(a.unmet for a in alloc_map.values())
            util = round((total_alloc / pool_total) * 100.0, 1) if pool_total > 0 else 0.0
            return ResourceUsageSummary(
                resource=name,
                total_pool=pool_total,
                total_allocated=total_alloc,
                total_unmet=total_unmet,
                utilization_percentage=util,
            )

        return [
            summarize("ambulances", self.pool.ambulances, ambulance_allocations),
            summarize("evacuation_vehicles", self.pool.evacuation_vehicles, vehicle_allocations),
            summarize("medics", self.pool.medics, medic_allocations),
        ]

    def verify_invariants(
        self,
        zone_allocations: List[ZoneAllocation],
        resource_summaries: List[ResourceUsageSummary],
        shelter_statuses: List[ShelterStatus],
    ):
        """
        Enforces strict mathematical invariants:
        1. sum(allocated) <= pool for every resource.
        2. allocated >= 0, unmet >= 0.
        3. shelter occupancy <= capacity.
        4. requested == allocated + unmet.
        """
        for summary in resource_summaries:
            if summary.total_allocated > summary.total_pool:
                raise SolverInvariantViolationError(
                    f"Invariant violated: {summary.resource} allocated ({summary.total_allocated}) "
                    f"exceeds pool ({summary.total_pool})"
                )

        for za in zone_allocations:
            for rname, ralloc in [
                ("ambulances", za.ambulances),
                ("evacuation_vehicles", za.evacuation_vehicles),
                ("medics", za.medics),
            ]:
                if ralloc.allocated < 0 or ralloc.unmet < 0:
                    raise SolverInvariantViolationError(
                        f"Negative allocation in zone {za.zone_id} for {rname}"
                    )
                if ralloc.requested != (ralloc.allocated + ralloc.unmet):
                    raise SolverInvariantViolationError(
                        f"Accounting mismatch in {za.zone_id} {rname}: "
                        f"requested {ralloc.requested} != allocated {ralloc.allocated} + unmet {ralloc.unmet}"
                    )

        for s in shelter_statuses:
            if s.allocated_count > s.capacity:
                raise SolverInvariantViolationError(
                    f"Shelter {s.id} occupancy {s.allocated_count} exceeds capacity {s.capacity}"
                )
            if s.allocated_count < 0:
                raise SolverInvariantViolationError(f"Shelter {s.id} occupancy negative")

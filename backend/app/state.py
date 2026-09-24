"""
In-memory state management and versioned plan history with differential analysis.
Handles baseline loading, dynamic zone addition, commander approvals, and diff calculation.
"""

import json
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


# Global singleton instance for easy import across endpoints
global_state_manager = StateManager()

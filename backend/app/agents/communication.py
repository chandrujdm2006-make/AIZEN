"""
Communication Agent for public safety broadcasts and SMS emergency alerts.
Runs AFTER the final plan is solved by the deterministic constraint solver.
Produces zone-specific alerts and general broadcasts in plain, actionable language.
"""

from typing import List, Tuple, Optional
from backend.app.agents.base import BaseAgent
from backend.app.models import (
    Zone,
    ZoneAllocation,
    Conflict,
    CommunicationPlan,
    ZoneAlert,
)


class CommunicationAgent(BaseAgent):
    def generate_alerts(
        self,
        zones: List[Zone],
        allocations: List[ZoneAllocation],
        conflicts: List[Conflict],
        is_replan: bool = False,
        diff_summary: Optional[List[str]] = None,
    ) -> Tuple[CommunicationPlan, str]:
        """
        Synthesizes SMS-sized public emergency alerts per zone and a general broadcast alert.
        Explains route detours, shelter assignments, and what changed during re-plans.
        """
        system_instruction = (
            "You are the Emergency Communications Agent. You produce clear, concise, actionable "
            "public emergency alerts for affected citizens. Keep each zone's 'sms_text' under 160 characters "
            "where possible, or short enough for standard SMS. Use plain language. "
            "If this is a re-plan, provide an explicit 'what_changed' explanation. "
            "Output strictly valid JSON matching the CommunicationPlan schema."
        )

        zone_summary_list = []
        for za in allocations:
            shelter_dest = (
                za.shelter_assignments[0].shelter_name
                if za.shelter_assignments
                else "Field staging area"
            )
            route_info = (
                " -> ".join(za.shelter_assignments[0].route_path)
                if za.shelter_assignments
                else "Local streets"
            )
            zone_summary_list.append(
                {
                    "zone_id": za.zone_id,
                    "zone_name": za.zone_name,
                    "priority_rank": za.priority_rank,
                    "ambulances_allocated": za.ambulances.allocated,
                    "ambulances_unmet": za.ambulances.unmet,
                    "vehicles_allocated": za.evacuation_vehicles.allocated,
                    "evacuees_sheltered": za.evacuees_sheltered,
                    "evacuees_unmet": za.evacuees_unmet,
                    "shelter_destination": shelter_dest,
                    "evacuation_route": route_info,
                }
            )

        prompt = f"""
Disaster Coordinated Plan Results:
Is Dynamic Re-plan: {is_replan}
Diff Summary: {diff_summary if diff_summary else 'Initial baseline emergency plan.'}

Zone Final Allocations & Routes:
{zone_summary_list}

Active Resolved Conflicts:
{[f"{c.conflict_type}: {c.description}" for c in conflicts]}

Generate a CommunicationPlan with:
1. 'agent_name': 'Communication Agent'
2. 'general_broadcast_alert': High-level SMS/radio broadcast for the entire metropolitan area.
3. 'zone_alerts': list of ZoneAlert items for each zone containing:
   - 'zone_id', 'zone_name'
   - 'urgency_level': 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
   - 'sms_text': Concise SMS text (actionable, urgent, route & shelter guidance)
   - 'evacuation_instructions'
   - 'shelter_info'
   - 'route_hazards'
   - 'precautions'
   - 'what_changed': string describing changes if re-plan, or baseline summary.
"""

        comm_plan, used_mode = self.execute_with_validation(
            prompt=prompt,
            response_model=CommunicationPlan,
            system_instruction=system_instruction,
        )
        comm_plan.mode = used_mode
        return comm_plan, used_mode

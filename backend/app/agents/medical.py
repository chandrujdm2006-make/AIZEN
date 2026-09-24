"""
Medical Agent for emergency triage, trauma patient transport, and on-site medic deployment.
Analyzes critical casualties, hypothermia, mobility-impaired residents, and ambulance scarcity.
"""

from typing import Tuple
from backend.app.agents.base import BaseAgent
from backend.app.models import ScenarioState, MedicalRecommendation


class MedicalAgent(BaseAgent):
    def analyze(self, state: ScenarioState) -> Tuple[MedicalRecommendation, str]:
        """
        Runs medical triage assessment for all zones in the scenario.
        Strictly prioritizes critical patients and vulnerable populations.
        """
        system_instruction = (
            "You are the Medical Emergency Response Agent. You analyze casualties, critical patient triage, "
            "and on-scene medical care requirements during a disaster. Total ambulances available is 3. "
            "Total field medics available is 6. Zones with mass critical casualties require urgent ambulance "
            "allocation. Output strictly valid JSON matching the MedicalRecommendation schema."
        )

        prompt = f"""
Disaster Scenario: {state.title}
Medical Resource Pool:
- Ambulances Available: {state.resource_pool.ambulances}
- Medics Available: {state.resource_pool.medics}

Zone Casualty & Vulnerability Breakdown:
{[
    {
        "zone_id": z.id,
        "zone_name": z.name,
        "flood_severity": z.flood_severity,
        "injured": z.injured,
        "critical_patients": z.critical_patients,
        "vulnerable_population": z.vulnerable_population,
    }
    for z in state.zones
]}

Note on Urgent Requirements:
Zone A (8 critical patients) and Zone D (6 critical patients) both face immediate life-threatening trauma
and require 2 ambulances each (4 requested vs 3 total pool).
Zone C and Zone B require on-site medic first aid.

Generate a MedicalRecommendation with:
1. 'agent_name': 'Medical Agent'
2. 'zone_requests': list of items with zone_id, medical_severity (1-5), requested_ambulances, requested_medics, triage_notes, vulnerable_group_concerns, urgency (0.0-1.0).
3. 'critical_triage_alerts': list of high-priority triage summary alerts.
"""

        recommendation, used_mode = self.execute_with_validation(
            prompt=prompt,
            response_model=MedicalRecommendation,
            system_instruction=system_instruction,
        )
        recommendation.mode = used_mode
        return recommendation, used_mode

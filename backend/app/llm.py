"""
LLM abstraction layer supporting Live Gemini LLM and deterministic MockLLMClient fallback.
Ensures zero runtime failure if API keys are missing or network calls fail.
"""

import os
import json
import logging
from typing import Optional, Protocol, Tuple, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger("coordinator.llm")


class LLMClient(Protocol):
    """Protocol for LLM interactions."""
    def generate_json(self, prompt: str, system_instruction: Optional[str] = None) -> str:
        ...


class GeminiClient:
    """Live Google Gemini Client using google-genai SDK."""

    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model_name = model_name
        try:
            from google import genai
            self.client = genai.Client(api_key=self.api_key)
        except Exception as e:
            logger.error(f"Failed to initialize Gemini Client: {e}")
            raise e

    def generate_json(self, prompt: str, system_instruction: Optional[str] = None) -> str:
        from google.genai import types

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )
        if system_instruction:
            config.system_instruction = system_instruction

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=config,
        )
        return response.text


class MockLLMClient:
    """
    Deterministic rule-based mock LLM client.
    Returns realistic, valid JSON responses for all three agents and conflict rationales.
    Guarantees the system operates 100% offline without network or token dependencies.
    """

    def generate_json(self, prompt: str, system_instruction: Optional[str] = None) -> str:
        prompt_lower = prompt.lower()

        # 1. Logistics Agent Request
        if "logistics" in prompt_lower or "requested_evac_vehicles" in prompt_lower:
            return self._mock_logistics_response(prompt)

        # 2. Medical Agent Request
        if "medical" in prompt_lower or "requested_ambulances" in prompt_lower or "triage" in prompt_lower:
            return self._mock_medical_response(prompt)

        # 3. Communication Agent Alert Generation
        if "communication" in prompt_lower or "public alert" in prompt_lower or "sms_text" in prompt_lower:
            return self._mock_communication_response(prompt)

        # 4. Conflict Resolution Rationale
        if "conflict" in prompt_lower or "rationale" in prompt_lower:
            return self._mock_conflict_rationale_response(prompt)

        # Default fallback
        return json.dumps({"status": "acknowledged", "notes": "Processed by rule-based Mock LLM engine."})

    def _mock_logistics_response(self, prompt: str) -> str:
        has_zone_e = "zone_e" in prompt.lower()

        requests = [
            {
                "zone_id": "zone_a",
                "requested_evac_vehicles": 4,
                "preferred_shelter_id": "shelter_north",
                "route_node_path": ["zone_a", "zone_b", "zone_c", "shelter_north"],
                "estimated_travel_minutes": 31.0,
                "is_alternate_route": True,
                "notes": "Direct route to Shelter North is blocked by floodwaters. Rerouted via Zone B and Zone C.",
                "confidence": 0.95,
            },
            {
                "zone_id": "zone_b",
                "requested_evac_vehicles": 2,
                "preferred_shelter_id": "shelter_south",
                "route_node_path": ["zone_b", "shelter_south"],
                "estimated_travel_minutes": 15.0,
                "is_alternate_route": False,
                "notes": "Direct arterial link to Shelter South is open and clear.",
                "confidence": 0.92,
            },
            {
                "zone_id": "zone_c",
                "requested_evac_vehicles": 4,
                "preferred_shelter_id": "shelter_north",
                "route_node_path": ["zone_c", "shelter_north"],
                "estimated_travel_minutes": 7.0,
                "is_alternate_route": False,
                "notes": "Direct open access to Shelter North.",
                "confidence": 0.96,
            },
            {
                "zone_id": "zone_d",
                "requested_evac_vehicles": 4,
                "preferred_shelter_id": "shelter_south",
                "route_node_path": ["zone_d", "shelter_south"],
                "estimated_travel_minutes": 10.0,
                "is_alternate_route": False,
                "notes": "Direct industrial link to Shelter South is operational.",
                "confidence": 0.94,
            },
        ]

        if has_zone_e:
            requests.insert(
                0,
                {
                    "zone_id": "zone_e",
                    "requested_evac_vehicles": 6,
                    "preferred_shelter_id": "shelter_south",
                    "route_node_path": ["zone_e", "shelter_south"],
                    "estimated_travel_minutes": 9.0,
                    "is_alternate_route": False,
                    "notes": "Highland dam breach: Urgent mass evacuation corridor to Shelter South.",
                    "confidence": 0.98,
                },
            )

        return json.dumps(
            {
                "agent_name": "Logistics Agent",
                "zone_requests": requests,
                "blocked_route_warnings": [
                    "Direct corridor Zone A -> Shelter North is BLOCKED. Active detour through Zone B/C adds 17 minutes."
                ],
                "shelter_capacity_warnings": [
                    "Total base evacuation demand (270 evacuees) exceeds combined shelter capacity (250 evacuees) by 20 individuals."
                ],
            }
        )

    def _mock_medical_response(self, prompt: str) -> str:
        has_zone_e = "zone_e" in prompt.lower()

        # Strict requirement: Zone A and Zone D each request 2 ambulances (4 requested vs 3 available)
        requests = [
            {
                "zone_id": "zone_a",
                "medical_severity": 4,
                "requested_ambulances": 2,
                "requested_medics": 3,
                "triage_notes": "8 critical trauma cases requiring rapid emergency transport; 28 injured total.",
                "vulnerable_group_concerns": "95 elderly and mobility-impaired residents require assisted paramedic triage.",
                "urgency": 0.96,
            },
            {
                "zone_id": "zone_d",
                "medical_severity": 4,
                "requested_ambulances": 2,
                "requested_medics": 2,
                "triage_notes": "6 critical hypothermia and chemical exposure cases from flooded industrial plant.",
                "vulnerable_group_concerns": "65 vulnerable residents stranded near secondary perimeter.",
                "urgency": 0.91,
            },
            {
                "zone_id": "zone_c",
                "medical_severity": 3,
                "requested_ambulances": 0,
                "requested_medics": 1,
                "triage_notes": "4 moderate respiratory distress patients; stabilized on-scene with first-response kit.",
                "vulnerable_group_concerns": "80 elderly residents safely staged at high ground.",
                "urgency": 0.70,
            },
            {
                "zone_id": "zone_b",
                "medical_severity": 2,
                "requested_ambulances": 0,
                "requested_medics": 0,
                "triage_notes": "Minor lacerations and contusions; community clinic managing local first-aid.",
                "vulnerable_group_concerns": "35 residents with mild mobility restrictions.",
                "urgency": 0.40,
            },
        ]

        if has_zone_e:
            requests.insert(
                0,
                {
                    "zone_id": "zone_e",
                    "medical_severity": 5,
                    "requested_ambulances": 2,
                    "requested_medics": 4,
                    "triage_notes": "14 critical drowning and crush injuries following sudden dam wall collapse.",
                    "vulnerable_group_concerns": "130 children and elderly in submerged single-story housing.",
                    "urgency": 0.99,
                },
            )

        return json.dumps(
            {
                "agent_name": "Medical Agent",
                "zone_requests": requests,
                "critical_triage_alerts": [
                    "Zone A and Zone D both report urgent multi-casualty incidents demanding 4 total ambulances against a 3-unit pool.",
                    "Zone A prioritized for full ambulance support due to higher critical patient volume (8 vs 6).",
                ],
            }
        )

    def _mock_communication_response(self, prompt: str) -> str:
        has_zone_e = "zone_e" in prompt.lower()

        zone_alerts = [
            {
                "zone_id": "zone_a",
                "zone_name": "Zone A - North Riverbank",
                "urgency_level": "CRITICAL",
                "sms_text": "EMERGENCY ALERT: Zone A floodwaters rising. Direct route to Shelter North is BLOCKED. Follow detours via Central Rd. 2 ambulances dispatched for critical cases.",
                "evacuation_instructions": "Move south toward Zone B junction. Do not attempt direct crossing to North Gym.",
                "shelter_info": "Assigned to Shelter North via detour. Secondary overflow to Shelter South.",
                "route_hazards": "North River Parkway is submerged and completely blocked.",
                "precautions": "Avoid downed power lines and stay on designated elevated pavements.",
                "what_changed": "Ambulance allocation maintained at 2 units. Evacuation rerouted.",
            },
            {
                "zone_id": "zone_d",
                "zone_name": "Zone D - Industrial South",
                "urgency_level": "HIGH",
                "sms_text": "URGENT NOTICE: Zone D industrial runoff detected. 1 ambulance on-scene; secondary transport en route. Evacuate to Shelter South via Industrial Blvd.",
                "evacuation_instructions": "Assemble at designated sector staging area 4. Evac buses departing every 15 mins.",
                "shelter_info": "Shelter South (Civic Center) is receiving evacuees.",
                "route_hazards": "Industrial Blvd open; drive with headlights on.",
                "precautions": "Wear masks if near chemical storage drainage canal.",
                "what_changed": "Ambulance pool scarcity limited allocation to 1 unit. On-site medics providing field triage.",
            },
            {
                "zone_id": "zone_c",
                "zone_name": "Zone C - Eastern Lowlands",
                "urgency_level": "MEDIUM",
                "sms_text": "ADVISORY: Zone C water level stable but low ground pooling. Evacuate elderly to Shelter North. Road open.",
                "evacuation_instructions": "Proceed eastward via Main St directly to Shelter North.",
                "shelter_info": "Shelter North is accessible with remaining capacity.",
                "route_hazards": "Connector to Zone B has standing water; proceed with caution.",
                "precautions": "Keep emergency radios tuned to 98.5 FM.",
                "what_changed": "Standard advisory; evacuation vehicles assigned.",
            },
            {
                "zone_id": "zone_b",
                "zone_name": "Zone B - Central District",
                "urgency_level": "LOW",
                "sms_text": "COMMUNITY ADVISORY: Zone B serves as transit corridor. Local flooding minimal. Shelter South staging open.",
                "evacuation_instructions": "Shelter in place unless directed by local marshals.",
                "shelter_info": "Shelter South is operational.",
                "route_hazards": "Expect increased transit traffic from Zone A detour.",
                "precautions": "Yield right of way to emergency vehicles.",
                "what_changed": "Serving as transit hub for northern sector evacuees.",
            },
        ]

        if has_zone_e:
            zone_alerts.insert(
                0,
                {
                    "zone_id": "zone_e",
                    "zone_name": "Zone E - Highland Dam Breach Sector",
                    "urgency_level": "CRITICAL",
                    "sms_text": "FLASH FLOOD EMERGENCY: Dam breach in Zone E. Immediate evacuation mandatory. Head south to Shelter South immediately.",
                    "evacuation_instructions": "Move immediately to high ground or designated bus pick-up points on Ridge Rd.",
                    "shelter_info": "Shelter South priority reception.",
                    "route_hazards": "Rapidly moving torrents crossing northern access roads.",
                    "precautions": "Do not enter moving floodwater on foot or by vehicle.",
                    "what_changed": "NEW EMERGENCY: Zone E added. Highest priority triage active.",
                },
            )

        return json.dumps(
            {
                "agent_name": "Communication Agent",
                "general_broadcast_alert": (
                    "CRITICAL FLOOD ADVISORY: Emergency Response Coordinator active. "
                    "All residents in northern and southern flood sectors must monitor official alerts. "
                    "Direct routes near Riverbank are closed; follow emergency marshal detours."
                ),
                "zone_alerts": zone_alerts,
            }
        )

    def _mock_conflict_rationale_response(self, prompt: str) -> str:
        return json.dumps(
            {
                "conflict_id": "conflict_amb_ad",
                "resolution_rationale": (
                    "Zone A was granted 2 ambulances while Zone D was granted 1 because Zone A demonstrated "
                    "higher priority score (89.2 vs 78.4) driven by 8 critical patients compared to 6 in Zone D, "
                    "plus severe structural risk along the riverbank."
                ),
            }
        )


def get_llm_client() -> Tuple[LLMClient, str]:
    """
    Factory function to initialize LLM client.
    Returns (client, mode) where mode is 'live_llm' or 'fallback_mock'.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

    if api_key:
        try:
            logger.info("Initializing live GeminiClient with provided API key...")
            client = GeminiClient(api_key=api_key, model_name=model_name)
            return client, "live_llm"
        except Exception as e:
            logger.warning(f"Failed to initialize GeminiClient ({e}), falling back to MockLLMClient.")
            return MockLLMClient(), "fallback_mock"

    logger.info("No GEMINI_API_KEY detected. Using deterministic MockLLMClient.")
    return MockLLMClient(), "fallback_mock"

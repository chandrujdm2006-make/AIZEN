"""
Logistics Agent for emergency evacuation and shelter transport.
Uses pre-computed Dijkstra routes, vehicle capacity constraints, and shelter capacities.
Does NOT invent routes.
"""

import math
from typing import List, Tuple
from backend.app.agents.base import BaseAgent
from backend.app.models import (
    ScenarioState,
    LogisticsRecommendation,
    LogisticsZoneRecommendation,
)
from backend.app.routing import RoutingGraph


class LogisticsAgent(BaseAgent):
    def analyze(
        self, state: ScenarioState, routing_graph: RoutingGraph
    ) -> Tuple[LogisticsRecommendation, str]:
        """
        Runs logistics assessment for all zones in the scenario.
        Injects deterministic Dijkstra routing options into the LLM context.
        """
        # Pre-compute routes for each zone to shelters
        precomputed_routing = {}
        blocked_warnings = []
        for z in state.zones:
            routes = routing_graph.find_shelter_routes(z.id, state.resource_pool.shelters)
            precomputed_routing[z.id] = []
            for shelter, route in routes:
                precomputed_routing[z.id].append(
                    {
                        "shelter_id": shelter.id,
                        "shelter_name": shelter.name,
                        "path": route.path,
                        "travel_minutes": route.total_travel_minutes,
                        "distance_km": route.total_distance_km,
                        "is_alternate_route": route.is_alternate_route,
                    }
                )
                if route.blocked_direct_detected:
                    blocked_warnings.append(
                        f"Direct arterial corridor from {z.name} to {shelter.name} is BLOCKED. Detour via {route.path} (+{route.total_travel_minutes} min)."
                    )

        # Check total shelter capacity vs demand
        total_evac_demand = sum(z.evacuation_demand for z in state.zones)
        total_shelter_cap = sum(s.capacity for s in state.resource_pool.shelters)
        shelter_warnings = []
        if total_evac_demand > total_shelter_cap:
            shelter_warnings.append(
                f"Total evacuation demand ({total_evac_demand}) exceeds total shelter capacity ({total_shelter_cap}) by {total_evac_demand - total_shelter_cap} evacuees."
            )

        system_instruction = (
            "You are the Logistics Emergency Response Agent. You analyze zone evacuation demands, "
            "shelter capacities, and road networks. You MUST use ONLY the verified Dijkstra routes provided. "
            "DO NOT invent routes. Each evacuation vehicle carries at most 20 passengers. "
            "Output strictly valid JSON matching the LogisticsRecommendation schema."
        )

        prompt = f"""
Disaster Scenario: {state.title}
Resource Pool:
- Evacuation Vehicles Available: {state.resource_pool.evacuation_vehicles} (capacity: 20 evacuees/vehicle)
- Shelters Available: {[f"{s.name} (Cap: {s.capacity})" for s in state.resource_pool.shelters]}

Zones Data:
{[
    {
        "zone_id": z.id,
        "zone_name": z.name,
        "flood_severity": z.flood_severity,
        "evacuation_demand": z.evacuation_demand,
        "suggested_min_vehicles": math.ceil(z.evacuation_demand / 20)
    }
    for z in state.zones
]}

Pre-computed Valid Road Routes:
{precomputed_routing}

Detected Route Warnings:
{blocked_warnings}

Capacity Warnings:
{shelter_warnings}

Generate a LogisticsRecommendation with:
1. 'agent_name': 'Logistics Agent'
2. 'zone_requests': list of items with zone_id, requested_evac_vehicles, preferred_shelter_id, route_node_path, estimated_travel_minutes, is_alternate_route, notes, confidence.
3. 'blocked_route_warnings': list of string warnings.
4. 'shelter_capacity_warnings': list of string warnings.
"""

        recommendation, used_mode = self.execute_with_validation(
            prompt=prompt,
            response_model=LogisticsRecommendation,
            system_instruction=system_instruction,
        )
        recommendation.mode = used_mode
        return recommendation, used_mode

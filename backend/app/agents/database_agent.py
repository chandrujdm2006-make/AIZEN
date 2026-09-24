"""
Database Management Agent for Multi-Agent Disaster Response Coordinator.
Acts as the single source of truth for all disaster scenario data, resource inventories,
road network topologies, and historical allocation records.
Provides tailored real-time data queries to Logistics, Medical, and Communication agents.
"""

from typing import Dict, List, Any, Optional
import datetime
import json
from pathlib import Path

from backend.app.database import get_connection, init_db, log_event
from backend.app.models import ScenarioState, Zone, RoadEdge, Shelter, ResourcePool, CoordinatedPlan
from backend.app.state import global_state_manager


class DatabaseAgent:
    def __init__(self):
        init_db()

    def get_structured_state(self) -> Dict[str, Any]:
        """
        Returns full structured disaster state in the standard format:
        {
          "zone_data": {...},
          "resource_status": {...},
          "available_resources": {...},
          "data_freshness_timestamp": "ISO_DATE",
          "conflict_alerts": [...]
        }
        """
        state: ScenarioState = global_state_manager.get_current_state()
        latest_plan: Optional[CoordinatedPlan] = global_state_manager.get_latest_plan()

        # 1. Zone demographics & state
        zone_data = {}
        for z in state.zones:
            zone_data[z.id] = {
                "name": z.name,
                "population": z.population,
                "flood_severity": z.flood_severity,
                "injured": z.injured,
                "critical_patients": z.critical_patients,
                "vulnerable_population": z.vulnerable_population,
                "evacuation_demand": z.evacuation_demand,
                "coordinates": {"x": z.x, "y": z.y},
            }

        # 2. Resource status & pool
        pool = state.resource_pool
        total_allocated_amb = 0
        total_allocated_veh = 0
        total_allocated_med = 0

        if latest_plan and latest_plan.allocations:
            total_allocated_amb = sum(a.ambulances.allocated for a in latest_plan.allocations)
            total_allocated_veh = sum(a.evacuation_vehicles.allocated for a in latest_plan.allocations)
            total_allocated_med = sum(a.medics.allocated for a in latest_plan.allocations)

        resource_status = {
            "ambulances": {
                "total_pool": pool.ambulances,
                "allocated": total_allocated_amb,
                "available": max(0, pool.ambulances - total_allocated_amb),
            },
            "evacuation_vehicles": {
                "total_pool": pool.evacuation_vehicles,
                "allocated": total_allocated_veh,
                "available": max(0, pool.evacuation_vehicles - total_allocated_veh),
                "passenger_capacity_per_unit": pool.vehicle_passenger_capacity,
            },
            "medics": {
                "total_pool": pool.medics,
                "allocated": total_allocated_med,
                "available": max(0, pool.medics - total_allocated_med),
            },
            "shelters": [
                {
                    "id": s.id,
                    "name": s.name,
                    "capacity": s.capacity,
                    "occupancy": s.current_occupancy,
                    "available_capacity": max(0, s.capacity - s.current_occupancy),
                }
                for s in pool.shelters
            ],
        }

        available_resources = {
            "ambulances": max(0, pool.ambulances - total_allocated_amb),
            "evacuation_vehicles": max(0, pool.evacuation_vehicles - total_allocated_veh),
            "medics": max(0, pool.medics - total_allocated_med),
            "shelter_beds": sum(max(0, s.capacity - s.current_occupancy) for s in pool.shelters),
        }

        # 3. Conflict alerts
        conflict_alerts = []
        if latest_plan and latest_plan.conflicts:
            for c in latest_plan.conflicts:
                conflict_alerts.append({
                    "id": c.id,
                    "type": c.conflict_type,
                    "resource": c.resource_type,
                    "zones": c.zones_involved,
                    "description": c.description,
                    "resolution": c.resolution_rationale,
                })
        else:
            # Check preliminary baseline conflicts
            total_crit = sum(z.critical_patients for z in state.zones)
            if total_crit > pool.ambulances:
                conflict_alerts.append({
                    "id": "PRE-AMB-DEFICIT",
                    "type": "contested_resource",
                    "resource": "ambulances",
                    "zones": [z.id for z in state.zones if z.critical_patients > 4],
                    "description": f"Critical casualty volume ({total_crit}) exceeds available ambulances ({pool.ambulances}).",
                })

        return {
            "zone_data": zone_data,
            "resource_status": resource_status,
            "available_resources": available_resources,
            "data_freshness_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "conflict_alerts": conflict_alerts,
        }

    # Query 1: For Logistics Agent
    def query_for_logistics(self) -> Dict[str, Any]:
        """Provides verified routes, shelter capacities, and fleet availability."""
        state = global_state_manager.get_current_state()
        return {
            "evacuation_vehicles_available": state.resource_pool.evacuation_vehicles,
            "vehicle_capacity": state.resource_pool.vehicle_passenger_capacity,
            "shelters": [
                {"id": s.id, "name": s.name, "capacity": s.capacity, "occupancy": s.current_occupancy}
                for s in state.resource_pool.shelters
            ],
            "roads": [
                {"from": r.from_node, "to": r.to_node, "minutes": r.travel_minutes, "status": r.status}
                for r in state.roads
            ],
            "evacuation_demands": {z.id: z.evacuation_demand for z in state.zones},
        }

    # Query 2: For Medical Agent
    def query_for_medical(self) -> Dict[str, Any]:
        """Provides casualty counts, triage severity, and paramedic inventory."""
        state = global_state_manager.get_current_state()
        return {
            "ambulances_available": state.resource_pool.ambulances,
            "medics_available": state.resource_pool.medics,
            "casualty_breakdown": {
                z.id: {
                    "injured": z.injured,
                    "critical": z.critical_patients,
                    "vulnerable": z.vulnerable_population,
                    "severity": z.flood_severity,
                }
                for z in state.zones
            },
        }

    # Query 3: For Communication Agent
    def query_for_communication(self) -> Dict[str, Any]:
        """Provides zone public safety demographics and hazard alerts."""
        state = global_state_manager.get_current_state()
        latest_plan = global_state_manager.get_latest_plan()
        return {
            "zones": [
                {"id": z.id, "name": z.name, "population": z.population, "severity": z.flood_severity}
                for z in state.zones
            ],
            "blocked_corridors": [
                f"{r.from_node} <-> {r.to_node}" for r in state.roads if r.status == "blocked"
            ],
            "has_plan": latest_plan is not None,
            "plan_version": latest_plan.plan_version if latest_plan else 0,
        }

    # Commit Decision Snapshot to SQLite
    def store_allocation_decision(self, plan: CoordinatedPlan):
        """Records full allocation decisions into persistent SQLite database."""
        conn = get_connection()
        cursor = conn.cursor()

        for a in plan.allocations:
            # Ambulances
            cursor.execute("""
            INSERT INTO allocations (plan_version, zone_id, resource_type, requested, allocated, unmet)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (plan.plan_version, a.zone_id, "ambulances", a.ambulances.requested, a.ambulances.allocated, a.ambulances.unmet))

            # Vehicles
            cursor.execute("""
            INSERT INTO allocations (plan_version, zone_id, resource_type, requested, allocated, unmet)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (plan.plan_version, a.zone_id, "evacuation_vehicles", a.evacuation_vehicles.requested, a.evacuation_vehicles.allocated, a.evacuation_vehicles.unmet))

            # Medics
            cursor.execute("""
            INSERT INTO allocations (plan_version, zone_id, resource_type, requested, allocated, unmet)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (plan.plan_version, a.zone_id, "medics", a.medics.requested, a.medics.allocated, a.medics.unmet))

        # Store public alerts
        if plan.communication_plan and plan.communication_plan.zone_alerts:
            for za in plan.communication_plan.zone_alerts:
                cursor.execute("""
                INSERT INTO alerts (plan_version, zone_id, urgency_level, sms_text)
                VALUES (?, ?, ?, ?)
                """, (plan.plan_version, za.zone_id, za.urgency_level, za.sms_text))

        conn.commit()
        conn.close()

        log_event("DATABASE_ALLOCATIONS_COMMITTED", {
            "plan_version": plan.plan_version,
            "total_zones": len(plan.allocations),
            "timestamp": datetime.datetime.now().isoformat(),
        })


# Global singleton instance
database_agent = DatabaseAgent()

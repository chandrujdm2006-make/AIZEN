"""
FastAPI application for the Multi-Agent Disaster Response Coordinator.
Provides REST and WebSocket API endpoints for real-time digital twin monitoring,
agent intelligence harvesting, conflict resolution, and dynamic re-planning.
"""

import os
import sys
from pathlib import Path

# Ensure repository root is on sys.path
_repo_root = str(Path(__file__).resolve().parent.parent.parent)
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

import json
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.app.models import (
    ScenarioState,
    CoordinatedPlan,
    AddZoneRequest,
    PlanApprovalRequest,
    ReplanDiff,
    Zone,
    RoadEdge,
    ZoneControlUpdate,
    GlobalPoolControlUpdate,
    ZoneManualAllocation,
    ControlPanelSyncRequest,
    ControlPanelConflictWarning,
    ControlPanelStateResponse,
)
from backend.app.state import global_state_manager
from backend.app.coordinator import DisasterCoordinator, PriorityScorer
from backend.app.llm import get_llm_client
from backend.app.database import (
    init_db,
    seed_db_from_base_scenario,
    log_event,
    update_zone_in_db,
    update_resource_pool_in_db,
    save_control_panel_log,
)
from backend.app.agents.database_agent import database_agent
from backend.app.websocket_manager import ws_manager



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and seed baseline
    seed_db_from_base_scenario()
    yield


app = FastAPI(
    title="Multi-Agent Disaster Response Coordinator API",
    description="GenAI decision-support system with deterministic resource constraint solving (HTH-GA-07).",
    version="2.0.0",
    lifespan=lifespan,
)

# Configure CORS for deployed frontend (Vercel, custom domains, local dev)
allowed_origins_env = os.environ.get("CORS_ORIGINS", os.environ.get("ALLOWED_ORIGINS", "*")).strip()
if allowed_origins_env == "*" or not allowed_origins_env:
    origins = ["*"]
else:
    origins = [orig.strip() for orig in allowed_origins_env.split(",") if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:\d+|http://127\.0\.0\.1:\d+",
)


@app.get("/")
def root():
    """Service status and API documentation entry point."""
    return {
        "service": "AIZEN Multi-Agent Disaster Response Coordinator API",
        "version": "2.0.0",
        "status": "operational",
        "docs": "/docs",
        "health": "/api/health",
        "websocket": "/ws",
    }


# --- DATABASE AGENT ENDPOINTS ---

@app.get("/api/database/state")
def get_database_agent_state():
    """
    Returns single-source-of-truth disaster state maintained by Database Agent:
    - zone_data
    - resource_status
    - available_resources
    - data_freshness_timestamp
    - conflict_alerts
    """
    return database_agent.get_structured_state()


@app.get("/api/database/logistics-query")
def query_logistics_data():
    """Provides verified routes, shelter capacities, and vehicle fleet status to Logistics Agent."""
    return database_agent.query_for_logistics()


@app.get("/api/database/medical-query")
def query_medical_data():
    """Provides casualty counts, triage severity, and paramedic inventory to Medical Agent."""
    return database_agent.query_for_medical()


@app.get("/api/database/communication-query")
def query_communication_data():
    """Provides zone public safety demographics and hazard alerts to Communication Agent."""
    return database_agent.query_for_communication()


# --- WEBSOCKET ENDPOINT ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send initial status
        state = global_state_manager.get_current_state()
        plan = global_state_manager.get_latest_plan()
        await websocket.send_text(json.dumps({
            "event": "CONNECTED",
            "scenario_id": state.scenario_id,
            "has_plan": plan is not None,
            "plan_version": plan.plan_version if plan else None,
        }))
        while True:
            data = await websocket.receive_text()
            # Heartbeat / ping response
            await websocket.send_text(json.dumps({"event": "PONG", "received": data}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# --- BASE HEALTH & SCENARIO ---
@app.get("/api/health")
def health_check():
    _, mode = get_llm_client()
    return {
        "status": "healthy",
        "service": "Disaster Response Coordinator",
        "llm_mode": mode,
        "websocket": "/ws",
    }


@app.get("/api/scenario", response_model=ScenarioState)
def get_scenario():
    """Returns the current disaster scenario state (zones, road graph, resource pool)."""
    return global_state_manager.get_current_state()


# --- REQUESTED REST ENDPOINTS (STEP 10) ---

@app.get("/api/zones")
def get_zones():
    """Returns all active disaster zones with real-time casualty & severity metrics."""
    state = global_state_manager.get_current_state()
    return state.zones


@app.get("/api/resources")
def get_resources():
    """Returns live available vs allocated resource pools."""
    state = global_state_manager.get_current_state()
    plan = global_state_manager.get_latest_plan()
    pool = state.resource_pool

    if plan and plan.resource_summaries:
        return {
            "pool": pool,
            "summaries": plan.resource_summaries,
            "shelters": plan.shelter_statuses,
        }

    return {
        "pool": pool,
        "summaries": [
            {"resource": "ambulances", "total_pool": pool.ambulances, "total_allocated": 0, "total_unmet": 0, "utilization_percentage": 0.0},
            {"resource": "evacuation_vehicles", "total_pool": pool.evacuation_vehicles, "total_allocated": 0, "total_unmet": 0, "utilization_percentage": 0.0},
            {"resource": "medics", "total_pool": pool.medics, "total_allocated": 0, "total_unmet": 0, "utilization_percentage": 0.0},
        ],
        "shelters": [
            {"id": s.id, "name": s.name, "capacity": s.capacity, "allocated_count": 0, "remaining_capacity": s.capacity, "saturation_percentage": 0.0}
            for s in pool.shelters
        ],
    }


@app.get("/api/agents")
def get_agents():
    """Returns the latest agent recommendations (Logistics, Medical, Communication)."""
    plan = global_state_manager.get_latest_plan()
    if not plan:
        return {
            "status": "idle",
            "message": "No active plan generated yet. Call POST /api/plan or /api/allocate.",
        }
    return {
        "logistics": plan.logistics_recommendations,
        "medical": plan.medical_recommendations,
        "communication": plan.communication_plan,
        "execution_modes": plan.agent_execution_modes,
    }


@app.get("/api/allocations")
def get_allocations():
    """Returns the current deterministic resource allocations and unmet demand per zone."""
    plan = global_state_manager.get_latest_plan()
    if not plan:
        return []
    return plan.allocations


@app.get("/api/allocate", response_model=CoordinatedPlan)
@app.post("/api/allocate", response_model=CoordinatedPlan)
async def allocate_resources():
    """Runs the full agent coordination and deterministic solver pipeline."""
    plan = generate_plan_internal()
    await ws_manager.broadcast({
        "event": "PLAN_GENERATED",
        "plan_version": plan.plan_version,
        "total_conflicts": len(plan.conflicts),
        "allocations": [a.model_dump() for a in plan.allocations],
    })
    return plan


@app.post("/api/plan", response_model=CoordinatedPlan)
async def generate_plan_endpoint():
    """Alias for /api/allocate for backward compatibility."""
    plan = generate_plan_internal()
    await ws_manager.broadcast({
        "event": "PLAN_GENERATED",
        "plan_version": plan.plan_version,
        "total_conflicts": len(plan.conflicts),
    })
    return plan


def generate_plan_internal() -> CoordinatedPlan:
    state = global_state_manager.get_current_state()
    history = global_state_manager.get_plan_history()
    next_version = len(history) + 1

    coordinator = DisasterCoordinator()
    plan = coordinator.coordinate_plan(
        state=state,
        plan_version=next_version,
        is_replan=(next_version > 1),
    )
    global_state_manager.save_plan(plan)
    database_agent.store_allocation_decision(plan)
    log_event("PLAN_GENERATED", {"version": next_version, "plan_id": plan.plan_id})
    return plan


@app.post("/api/replan")
async def trigger_replan():
    """Re-runs the multi-agent coordination pipeline on the current state."""
    plan = generate_plan_internal()
    await ws_manager.broadcast({
        "event": "REPLAN_COMPLETED",
        "plan_version": plan.plan_version,
    })
    return plan


@app.post("/api/add-zone")
async def add_critical_zone_endpoint(request: Optional[AddZoneRequest] = None):
    """
    Dynamic Re-planning Demo (+ ADD CRITICAL ZONE):
    Injects Zone E (Dam Breach, Severity 5, High Casualty Demand),
    recalculates medical demand, routing, public alert, and resolves conflict.
    """
    return await add_zone_and_replan(request)


@app.post("/api/zones")
async def add_zone_and_replan(request: Optional[AddZoneRequest] = None):
    old_plan = global_state_manager.get_latest_plan()

    # If no payload provided, load default Zone E from data directory
    if request is None or request.zone is None:
        zone_e_path = Path(__file__).parent.parent / "data" / "scenario_zone_e.json"
        with open(zone_e_path, "r", encoding="utf-8") as f:
            zone_e_data = json.load(f)
        new_zone = Zone(**zone_e_data["zone"])
        new_roads = [RoadEdge(**r) for r in zone_e_data["new_roads"]]
    else:
        new_zone = request.zone
        new_roads = request.new_roads

    # Merge into active scenario state
    updated_state = global_state_manager.add_zone(new_zone, new_roads)

    # Compute new plan
    history = global_state_manager.get_plan_history()
    next_version = len(history) + 1

    coordinator = DisasterCoordinator()
    new_plan = coordinator.coordinate_plan(
        state=updated_state,
        plan_version=next_version,
        is_replan=True,
    )

    diff = None
    if old_plan:
        diff = global_state_manager.compute_replan_diff(old_plan, new_plan)
        if diff.summary_of_changes:
            new_plan.decision_trace.final_tradeoffs.insert(
                0, f"RE-PLAN DELTAS: {'; '.join(diff.summary_of_changes[:3])}"
            )

    global_state_manager.save_plan(new_plan)
    log_event("ZONE_ADDED", {"zone_id": new_zone.id, "version": next_version})

    # Broadcast real-time WebSocket update
    await ws_manager.broadcast({
        "event": "CRITICAL_ZONE_ADDED",
        "zone_id": new_zone.id,
        "plan_version": next_version,
        "diff": diff.model_dump() if diff else None,
    })

    return {
        "plan": new_plan,
        "diff": diff,
    }


@app.get("/api/alerts")
def get_alerts():
    """Returns the latest public emergency alerts drafted by the Communication Agent."""
    plan = global_state_manager.get_latest_plan()
    if not plan or not plan.communication_plan:
        return {"general_broadcast": "No active emergency plan.", "zone_alerts": []}
    return {
        "general_broadcast": plan.communication_plan.general_broadcast_alert,
        "zone_alerts": plan.communication_plan.zone_alerts,
    }


@app.post("/api/reset", response_model=ScenarioState)
async def reset_scenario():
    """Resets the scenario state to the baseline (Zones A-D) and clears plan history."""
    state = global_state_manager.reset_to_base()
    seed_db_from_base_scenario()
    await ws_manager.broadcast({"event": "SCENARIO_RESET"})
    return state


@app.get("/api/plan/history", response_model=List[CoordinatedPlan])
def get_plan_history():
    """Returns all generated plan versions for audit and comparison."""
    return global_state_manager.get_plan_history()


@app.post("/api/plan/approve")
async def approve_plan(
    approval: PlanApprovalRequest,
    plan_id: Optional[str] = Body(None, embed=True),
):
    target_plan_id = plan_id
    if not target_plan_id:
        latest = global_state_manager.get_latest_plan()
        if not latest:
            raise HTTPException(
                status_code=400, detail="No generated plan available to approve."
            )
        target_plan_id = latest.plan_id

    approved_plan = global_state_manager.approve_plan(
        plan_id=target_plan_id,
        commander_name=approval.commander_name,
        notes=approval.notes,
    )
    if not approved_plan:
        raise HTTPException(
            status_code=404, detail=f"Plan {target_plan_id} not found."
        )

    log_event("PLAN_APPROVED", {"plan_id": approved_plan.plan_id, "commander": approval.commander_name})

    await ws_manager.broadcast({
        "event": "PLAN_APPROVED",
        "plan_id": approved_plan.plan_id,
        "commander_name": approved_plan.approved_by,
        "approved_at": approved_plan.approved_at,
    })

    return {
        "status": "approved",
        "plan_id": approved_plan.plan_id,
        "plan_version": approved_plan.plan_version,
        "approved_by": approved_plan.approved_by,
        "approved_at": approved_plan.approved_at,
        "notes": approval.notes,
    }


# --- DYNAMIC CONTROL PANEL ENDPOINTS ---

@app.get("/api/control-panel/state")
def get_control_panel_state():
    """
    Returns full real-time state for the Dynamic Control Panel:
    - All zones (A, B, C, D, E) with demographics, flood severity (1-10), vulnerable %, priority overrides
    - Global resource pool with total & available limits
    - Real-time utilization % per resource
    - Current zone allocations
    - Zone priority rankings & auto-calculated vs override breakdown
    - Real-time constraint violations and conflict warnings
    """
    state = global_state_manager.get_current_state()
    plan = global_state_manager.get_latest_plan()
    scorer = PriorityScorer()

    # Get all zones including potential Zone E
    all_zones = global_state_manager.get_all_zones_including_potential()
    ranked_zones = scorer.rank_zones(all_zones)

    # Calculate real-time utilization
    pool = state.resource_pool
    allocations = plan.allocations if plan else []

    total_amb_alloc = sum(a.ambulances.allocated for a in allocations) if allocations else 0
    total_veh_alloc = sum(a.evacuation_vehicles.allocated for a in allocations) if allocations else 0
    total_med_alloc = sum(a.medics.allocated for a in allocations) if allocations else 0
    total_she_alloc = sum(a.evacuees_sheltered for a in allocations) if allocations else 0
    total_shelter_cap = sum(s.capacity for s in pool.shelters)

    utilization = {
        "ambulances": round((total_amb_alloc / pool.ambulances * 100.0), 1) if pool.ambulances > 0 else 0.0,
        "evacuation_vehicles": round((total_veh_alloc / pool.evacuation_vehicles * 100.0), 1) if pool.evacuation_vehicles > 0 else 0.0,
        "medics": round((total_med_alloc / pool.medics * 100.0), 1) if pool.medics > 0 else 0.0,
        "shelter": round((total_she_alloc / total_shelter_cap * 100.0), 1) if total_shelter_cap > 0 else 0.0,
    }

    # Evaluate conflicts & warnings
    conflicts = global_state_manager.check_control_panel_conflicts()

    return {
        "zones": all_zones,
        "resource_pool": pool,
        "current_allocations": allocations,
        "zones_ranked": ranked_zones,
        "utilization": utilization,
        "conflicts": conflicts,
        "total_shelter_capacity": total_shelter_cap,
        "total_shelter_allocated": total_she_alloc,
        "is_replan_active": plan is not None,
        "plan_version": plan.plan_version if plan else None,
    }


@app.post("/api/control-panel/sync")
async def sync_control_panel(request: ControlPanelSyncRequest):
    """
    Dynamically applies updated zone parameters, priority overrides, and resource pool limits.
    Validates hard constraints, updates SQLite, triggers automated re-planning,
    and broadcasts live WebSocket update to the main digital twin dashboard.
    """
    old_plan = global_state_manager.get_latest_plan()

    # 1. Hard constraint validation for manual allocations if supplied
    if request.manual_allocations:
        tot_amb = sum(a.assigned_ambulances for a in request.manual_allocations)
        tot_veh = sum(a.assigned_evacuation_vehicles for a in request.manual_allocations)
        tot_med = sum(a.assigned_medics for a in request.manual_allocations)
        tot_she = sum(a.assigned_shelter_spaces for a in request.manual_allocations)

        if tot_amb > request.resources.ambulances:
            raise HTTPException(
                status_code=400,
                detail=f"Constraint Violation: Total assigned ambulances ({tot_amb}) exceeds available pool limit ({request.resources.ambulances})."
            )
        if tot_veh > request.resources.evacuation_vehicles:
            raise HTTPException(
                status_code=400,
                detail=f"Constraint Violation: Total assigned evacuation vehicles ({tot_veh}) exceeds available pool limit ({request.resources.evacuation_vehicles})."
            )
        if tot_med > request.resources.medics:
            raise HTTPException(
                status_code=400,
                detail=f"Constraint Violation: Total assigned medics ({tot_med}) exceeds available pool limit ({request.resources.medics})."
            )
        if tot_she > request.resources.shelter_capacity:
            raise HTTPException(
                status_code=400,
                detail=f"Constraint Violation: Total assigned shelter spaces ({tot_she}) exceeds total shelter capacity ({request.resources.shelter_capacity})."
            )

    # 2. Update state manager with new parameters
    updated_state = global_state_manager.update_from_control_panel(
        zones_update=request.zones,
        pool_update=request.resources,
    )

    # 3. Persist updates to SQLite database
    for zu in request.zones:
        vuln_pop = round(zu.population * (zu.vulnerable_percent / 100.0))
        z_dict = zu.model_dump()
        z_dict["vulnerable_population"] = vuln_pop
        update_zone_in_db(z_dict)

    update_resource_pool_in_db(request.resources.model_dump())

    # 4. Re-plan or apply manual allocations
    history = global_state_manager.get_plan_history()
    next_version = len(history) + 1

    coordinator = DisasterCoordinator()
    new_plan = coordinator.coordinate_plan(
        state=updated_state,
        plan_version=next_version,
        is_replan=True,
    )

    # If manual allocations provided, override solver allocations with commander assignments
    if request.manual_allocations:
        manual_map = {m.zone_id: m for m in request.manual_allocations}
        for a in new_plan.allocations:
            if a.zone_id in manual_map:
                m = manual_map[a.zone_id]
                a.ambulances.allocated = m.assigned_ambulances
                a.ambulances.unmet = max(0, a.ambulances.requested - m.assigned_ambulances)

                a.evacuation_vehicles.allocated = m.assigned_evacuation_vehicles
                a.evacuation_vehicles.unmet = max(0, a.evacuation_vehicles.requested - m.assigned_evacuation_vehicles)

                a.medics.allocated = m.assigned_medics
                a.medics.unmet = max(0, a.medics.requested - m.assigned_medics)

                a.evacuees_sheltered = m.assigned_shelter_spaces
                a.rationale = f"Tactical manual assignment by Commander {request.commander_name}"

        # Recalculate resource summaries for manual allocation
        for summary in new_plan.resource_summaries:
            if summary.resource == "ambulances":
                tot = sum(a.ambulances.allocated for a in new_plan.allocations)
                summary.total_allocated = tot
                summary.total_unmet = max(0, sum(a.ambulances.unmet for a in new_plan.allocations))
                summary.utilization_percentage = round((tot / updated_state.resource_pool.ambulances) * 100.0, 1)
            elif summary.resource == "evacuation_vehicles":
                tot = sum(a.evacuation_vehicles.allocated for a in new_plan.allocations)
                summary.total_allocated = tot
                summary.total_unmet = max(0, sum(a.evacuation_vehicles.unmet for a in new_plan.allocations))
                summary.utilization_percentage = round((tot / updated_state.resource_pool.evacuation_vehicles) * 100.0, 1)
            elif summary.resource == "medics":
                tot = sum(a.medics.allocated for a in new_plan.allocations)
                summary.total_allocated = tot
                summary.total_unmet = max(0, sum(a.medics.unmet for a in new_plan.allocations))
                summary.utilization_percentage = round((tot / updated_state.resource_pool.medics) * 100.0, 1)

    diff = None
    if old_plan:
        diff = global_state_manager.compute_replan_diff(old_plan, new_plan)

    global_state_manager.save_plan(new_plan)
    database_agent.store_allocation_decision(new_plan)

    save_control_panel_log(
        commander_name=request.commander_name or "Commander",
        action_type="CONTROL_PANEL_SYNC",
        zones_data=[z.model_dump() for z in request.zones],
        resources_data=request.resources.model_dump(),
        allocations_data=[m.model_dump() for m in request.manual_allocations] if request.manual_allocations else None,
        status="success",
    )

    # 5. Broadcast real-time update to all dashboard listeners
    await ws_manager.broadcast({
        "event": "CONTROL_PANEL_UPDATED",
        "plan_version": next_version,
        "commander_name": request.commander_name,
        "diff": diff.model_dump() if diff else None,
        "zones_ranked": [z.model_dump() for z in new_plan.zones_ranked],
        "allocations": [a.model_dump() for a in new_plan.allocations],
    })

    conflicts = global_state_manager.check_control_panel_conflicts(request.manual_allocations)

    return {
        "status": "success",
        "plan": new_plan,
        "diff": diff,
        "conflicts": conflicts,
    }


@app.post("/api/control-panel/reset")
async def reset_control_panel():
    """Resets all zones and resource pool to baseline defaults."""
    state = global_state_manager.reset_to_base()
    seed_db_from_base_scenario()
    await ws_manager.broadcast({"event": "CONTROL_PANEL_RESET"})
    return {"status": "reset", "state": state}


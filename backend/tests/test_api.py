"""
End-to-end integration tests for FastAPI REST API endpoints.
Tests scenario retrieval, plan creation, Zone E re-planning, diff auditing, approval, and reset.
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.state import global_state_manager

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_system_state():
    """Ensure clean baseline state before each test."""
    global_state_manager.reset_to_base()
    yield
    global_state_manager.reset_to_base()


def test_get_scenario():
    response = client.get("/api/scenario")
    assert response.status_code == 200
    data = response.json()
    assert data["scenario_id"] == "flood_base"
    assert len(data["zones"]) == 4
    assert data["resource_pool"]["ambulances"] == 3
    assert data["resource_pool"]["evacuation_vehicles"] == 5
    assert data["resource_pool"]["medics"] == 6


def test_generate_plan():
    response = client.post("/api/plan")
    assert response.status_code == 200
    plan = response.json()

    assert plan["plan_version"] == 1
    assert "zones_ranked" in plan
    assert len(plan["zones_ranked"]) == 4

    # Zone A vs Zone D resolution check
    alloc_map = {a["zone_id"]: a for a in plan["allocations"]}
    assert alloc_map["zone_a"]["ambulances"]["allocated"] == 2
    assert alloc_map["zone_a"]["ambulances"]["unmet"] == 0

    assert alloc_map["zone_d"]["ambulances"]["allocated"] == 1
    assert alloc_map["zone_d"]["ambulances"]["unmet"] == 1

    # Check shelter statuses
    assert len(plan["shelter_statuses"]) == 2
    assert "decision_trace" in plan


def test_add_zone_and_replan_with_diff():
    # 1. Generate base plan v1
    resp1 = client.post("/api/plan")
    assert resp1.status_code == 200
    plan_v1 = resp1.json()
    assert plan_v1["plan_version"] == 1

    # 2. Inject Zone E mid-crisis
    resp2 = client.post("/api/zones")
    assert resp2.status_code == 200
    data = resp2.json()

    assert "plan" in data
    assert "diff" in data

    plan_v2 = data["plan"]
    diff = data["diff"]

    assert plan_v2["plan_version"] == 2
    assert len(plan_v2["zones_ranked"]) == 5
    # Zone E has highest severity and should rank #1
    assert plan_v2["zones_ranked"][0]["zone_id"] == "zone_e"
    assert plan_v2["zones_ranked"][0]["rank"] == 1

    # Check diff
    assert diff["old_version"] == 1
    assert diff["new_version"] == 2
    assert "zone_e" in diff["newly_added_zones"]
    assert len(diff["allocation_diffs"]) == 5
    assert len(diff["summary_of_changes"]) > 0


def test_plan_approval_workflow():
    # Generate plan
    client.post("/api/plan")

    approval_payload = {
        "approval": {
            "commander_name": "Commander Sarah Jenkins",
            "notes": "Emergency orders approved for deployment across all sectors.",
        }
    }
    resp = client.post("/api/plan/approve", json=approval_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "approved"
    assert data["approved_by"] == "Commander Sarah Jenkins"
    assert data["approved_at"] is not None

    # Verify history reflects approval
    hist_resp = client.get("/api/plan/history")
    assert hist_resp.status_code == 200
    plans = hist_resp.json()
    assert len(plans) == 1
    assert plans[0]["is_approved"] is True
    assert plans[0]["approved_by"] == "Commander Sarah Jenkins"


def test_reset_scenario():
    # Add Zone E
    client.post("/api/zones")
    scen_resp = client.get("/api/scenario")
    assert len(scen_resp.json()["zones"]) == 5

    # Reset
    reset_resp = client.post("/api/reset")
    assert reset_resp.status_code == 200
    assert len(reset_resp.json()["zones"]) == 4

    # Verify history cleared
    hist_resp = client.get("/api/plan/history")
    assert len(hist_resp.json()) == 0

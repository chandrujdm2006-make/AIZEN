"""
Tests for Dynamic Control Panel endpoints and constraint validations.
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.state import global_state_manager
from backend.app.database import get_connection

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_before_test():
    global_state_manager.reset_to_base()
    yield
    global_state_manager.reset_to_base()


def test_get_control_panel_state():
    res = client.get("/api/control-panel/state")
    assert res.status_code == 200
    data = res.json()

    # All 5 zones (A, B, C, D, E) should be visible
    zone_ids = [z["id"] for z in data["zones"]]
    assert "zone_a" in zone_ids
    assert "zone_b" in zone_ids
    assert "zone_c" in zone_ids
    assert "zone_d" in zone_ids
    assert "zone_e" in zone_ids

    # Global resource pool check
    pool = data["resource_pool"]
    assert pool["ambulances"] >= 3
    assert pool["evacuation_vehicles"] >= 5
    assert pool["medics"] >= 6

    # Utilization dictionary
    util = data["utilization"]
    assert "ambulances" in util
    assert "evacuation_vehicles" in util
    assert "medics" in util
    assert "shelter" in util


def test_sync_control_panel_updates_and_replans():
    state_res = client.get("/api/control-panel/state")
    current_state = state_res.json()

    zones_update = [
        {
            "id": z["id"],
            "name": z["name"],
            "population": z["population"],
            "evacuation_demand": z["evacuation_demand"],
            "injured": z["injured"],
            "critical_patients": z["critical_patients"],
            "flood_severity": 9 if z["id"] == "zone_a" else z["flood_severity"],
            "vulnerable_percent": 25.0,
            "priority_override": None,
        }
        for z in current_state["zones"]
    ]

    pool_update = {
        "ambulances": 6,
        "evacuation_vehicles": 8,
        "medics": 10,
        "shelter_capacity": 500,
    }

    sync_res = client.post("/api/control-panel/sync", json={
        "zones": zones_update,
        "resources": pool_update,
        "auto_replan": True,
        "commander_name": "Commander Shepard",
    })
    assert sync_res.status_code == 200
    res_data = sync_res.json()
    assert res_data["status"] == "success"
    assert res_data["plan"] is not None

    # Check that SQLite was updated
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT total_pool FROM resources WHERE id = 'ambulances'")
    row = cursor.fetchone()
    assert row["total_pool"] == 6

    cursor.execute("SELECT flood_severity FROM zones WHERE id = 'zone_a'")
    z_row = cursor.fetchone()
    assert z_row["flood_severity"] == 9
    conn.close()


def test_manual_priority_override_shifts_ranking():
    state_res = client.get("/api/control-panel/state")
    current_state = state_res.json()

    # Give Zone B (usually lower priority) an extreme override of 99.5
    zones_update = [
        {
            "id": z["id"],
            "name": z["name"],
            "population": z["population"],
            "evacuation_demand": z["evacuation_demand"],
            "injured": z["injured"],
            "critical_patients": z["critical_patients"],
            "flood_severity": z["flood_severity"],
            "vulnerable_percent": 20.0,
            "priority_override": 99.5 if z["id"] == "zone_b" else None,
        }
        for z in current_state["zones"]
    ]

    pool_update = {
        "ambulances": 3,
        "evacuation_vehicles": 5,
        "medics": 6,
        "shelter_capacity": 450,
    }

    sync_res = client.post("/api/control-panel/sync", json={
        "zones": zones_update,
        "resources": pool_update,
        "auto_replan": True,
        "commander_name": "Test Commander",
    })
    assert sync_res.status_code == 200
    plan = sync_res.json()["plan"]

    # Zone B must now be Rank 1 with score 99.5
    top_zone = plan["zones_ranked"][0]
    assert top_zone["zone_id"] == "zone_b"
    assert top_zone["score"] == 99.5


def test_constraint_validation_blocks_over_allocation():
    state_res = client.get("/api/control-panel/state")
    current_state = state_res.json()

    zones_update = [
        {
            "id": z["id"],
            "name": z["name"],
            "population": z["population"],
            "evacuation_demand": z["evacuation_demand"],
            "injured": z["injured"],
            "critical_patients": z["critical_patients"],
            "flood_severity": z["flood_severity"],
            "vulnerable_percent": 20.0,
            "priority_override": None,
        }
        for z in current_state["zones"]
    ]

    pool_update = {
        "ambulances": 3,
        "evacuation_vehicles": 5,
        "medics": 6,
        "shelter_capacity": 450,
    }

    # Assign 10 ambulances across zones when pool only has 3
    invalid_manual_allocations = [
        {"zone_id": "zone_a", "assigned_ambulances": 5, "assigned_evacuation_vehicles": 2, "assigned_medics": 2, "assigned_shelter_spaces": 50},
        {"zone_id": "zone_b", "assigned_ambulances": 5, "assigned_evacuation_vehicles": 2, "assigned_medics": 2, "assigned_shelter_spaces": 50},
    ]

    sync_res = client.post("/api/control-panel/sync", json={
        "zones": zones_update,
        "resources": pool_update,
        "manual_allocations": invalid_manual_allocations,
        "auto_replan": False,
        "commander_name": "Test Commander",
    })

    # Must be rejected with 400 Bad Request
    assert sync_res.status_code == 400
    assert "Constraint Violation" in sync_res.json()["detail"]


def test_control_panel_reset():
    reset_res = client.post("/api/control-panel/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["status"] == "reset"

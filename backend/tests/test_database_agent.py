"""
Tests for Database Management Agent.
Verifies persistent storage, single source of truth structured output,
and specialized queries for Logistics, Medical, and Communication agents.
"""

import pytest
from backend.app.agents.database_agent import database_agent
from backend.app.coordinator import DisasterCoordinator
from backend.app.state import global_state_manager
from backend.app.database import get_connection


@pytest.fixture(autouse=True)
def setup_state():
    global_state_manager.reset_to_base()
    yield
    global_state_manager.reset_to_base()


def test_database_agent_structured_output():
    """Verifies the exact structured JSON format required from Database Agent."""
    state_payload = database_agent.get_structured_state()

    assert "zone_data" in state_payload
    assert "resource_status" in state_payload
    assert "available_resources" in state_payload
    assert "data_freshness_timestamp" in state_payload
    assert "conflict_alerts" in state_payload

    # Check zone data contents
    assert "zone_a" in state_payload["zone_data"]
    assert state_payload["zone_data"]["zone_a"]["population"] == 450
    assert state_payload["zone_data"]["zone_a"]["critical_patients"] == 8

    # Check resource status
    assert state_payload["resource_status"]["ambulances"]["total_pool"] == 3
    assert state_payload["resource_status"]["evacuation_vehicles"]["total_pool"] == 5
    assert len(state_payload["resource_status"]["shelters"]) == 2


def test_database_agent_queries_for_agents():
    """Verifies that Database Agent satisfies the specific query needs of each agent."""
    logistics_data = database_agent.query_for_logistics()
    assert "evacuation_vehicles_available" in logistics_data
    assert "shelters" in logistics_data
    assert "roads" in logistics_data
    assert len(logistics_data["roads"]) > 0

    medical_data = database_agent.query_for_medical()
    assert "ambulances_available" in medical_data
    assert "casualty_breakdown" in medical_data
    assert "zone_a" in medical_data["casualty_breakdown"]
    assert medical_data["casualty_breakdown"]["zone_a"]["critical"] == 8

    comm_data = database_agent.query_for_communication()
    assert "zones" in comm_data
    assert "blocked_corridors" in comm_data
    assert any("zone_a" in c for c in comm_data["blocked_corridors"])


def test_database_agent_stores_allocations():
    """Verifies that allocation decisions are committed to SQLite tables."""
    coordinator = DisasterCoordinator()
    plan = coordinator.coordinate_plan(global_state_manager.get_current_state(), plan_version=1)

    database_agent.store_allocation_decision(plan)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as count FROM allocations WHERE plan_version = 1")
    row = cursor.fetchone()
    assert row["count"] > 0

    cursor.execute("SELECT * FROM allocations WHERE zone_id = 'zone_a' AND resource_type = 'ambulances'")
    amb_row = cursor.fetchone()
    assert amb_row is not None
    assert amb_row["allocated"] == 2
    assert amb_row["unmet"] == 0

    conn.close()

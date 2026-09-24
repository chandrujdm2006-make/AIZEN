"""
Tests for Coordinator, PriorityScorer, ConflictDetector, and Agent orchestration.
"""

import json
from pathlib import Path
import pytest
from backend.app.models import ScenarioState, Zone
from backend.app.coordinator import PriorityScorer, ConflictDetector, DisasterCoordinator
from backend.app.routing import RoutingGraph
from backend.app.llm import MockLLMClient


@pytest.fixture
def base_state():
    base_path = Path(__file__).parent.parent / "data" / "scenario_base.json"
    with open(base_path, "r", encoding="utf-8") as f:
        return ScenarioState(**json.load(f))


def test_priority_scoring_weights(base_state):
    scorer = PriorityScorer()
    ranked = scorer.rank_zones(base_state.zones)

    assert len(ranked) == 4
    # Zone A (severity 4, crit 8, vuln 95, pop 450, evac 70) should be Rank 1
    assert ranked[0].zone_id == "zone_a"
    assert ranked[0].rank == 1
    assert ranked[0].score > 60.0

    # Zone D (severity 4, crit 6, vuln 65, pop 380, evac 80) should be Rank 2
    assert ranked[1].zone_id == "zone_d"
    assert ranked[1].rank == 2

    # Check breakdown fields
    for rz in ranked:
        bd = rz.breakdown
        assert bd.severity_component > 0
        assert bd.critical_patients_component >= 0
        assert bd.total_score == rz.score


def test_coordinator_pipeline_end_to_end(base_state):
    coordinator = DisasterCoordinator(llm_client=MockLLMClient(), mode="fallback_mock")
    plan = coordinator.coordinate_plan(base_state, plan_version=1)

    assert plan.plan_version == 1
    assert len(plan.zones_ranked) == 4
    assert len(plan.allocations) == 4
    assert len(plan.conflicts) >= 3

    # Check that contested ambulance conflict is explicitly identified
    amb_conflict = next(
        (c for c in plan.conflicts if c.conflict_type == "contested_resource"), None
    )
    assert amb_conflict is not None
    assert amb_conflict.resource_type == "ambulances"
    assert amb_conflict.resolution_rationale is not None

    # Check Zone A and Zone D allocations
    alloc_map = {a.zone_id: a for a in plan.allocations}
    assert alloc_map["zone_a"].ambulances.allocated == 2
    assert alloc_map["zone_a"].ambulances.unmet == 0

    assert alloc_map["zone_d"].ambulances.allocated == 1
    assert alloc_map["zone_d"].ambulances.unmet == 1

    # Check Communication Alerts
    assert len(plan.communication_plan.zone_alerts) == 4
    assert plan.communication_plan.general_broadcast_alert != ""

    # Check Decision Trace
    assert len(plan.decision_trace.solver_steps) > 0
    assert len(plan.decision_trace.conflicts_detected) > 0

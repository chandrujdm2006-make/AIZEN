"""
Comprehensive unit and property-based invariant tests for the deterministic solver.
Includes:
- Acceptance test: Zone A / Zone D ambulance conflict resolution (2 + 1, 1 unmet)
- Invariant property tests over 200 randomized scenarios
- Absolute determinism test
- Multi-shelter capacity splitting and overflow tests
- Zone E dynamic re-plan solver test
"""

import random
import json
from pathlib import Path
import pytest

from backend.app.models import (
    Zone,
    Shelter,
    ResourcePool,
    ZonePriority,
    PriorityFactorBreakdown,
    RoadEdge,
)
from backend.app.routing import RoutingGraph
from backend.app.solver import DeterministicSolver, SolverInvariantViolationError


@pytest.fixture
def base_scenario_data():
    base_path = Path(__file__).parent.parent / "data" / "scenario_base.json"
    with open(base_path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def zone_e_data():
    e_path = Path(__file__).parent.parent / "data" / "scenario_zone_e.json"
    with open(e_path, "r", encoding="utf-8") as f:
        return json.load(f)


def create_dummy_priority(zone: Zone, rank: int, score: float) -> ZonePriority:
    return ZonePriority(
        zone_id=zone.id,
        zone_name=zone.name,
        score=score,
        rank=rank,
        breakdown=PriorityFactorBreakdown(
            severity_component=score * 0.3,
            critical_patients_component=score * 0.25,
            vulnerable_component=score * 0.15,
            population_component=score * 0.15,
            evac_demand_component=score * 0.15,
            total_score=score,
        ),
    )


def test_zone_a_d_ambulance_conflict_resolution(base_scenario_data):
    """
    CRITICAL ACCEPTANCE CRITERIA:
    Zone A and Zone D each request 2 ambulances (4 requested vs 3 available).
    Zone A has higher priority (critical patients 8 vs 6, severity 4).
    Pass 1 guarantees 1 to Zone A, 1 to Zone D.
    Pass 2 allocates remaining 1 ambulance to higher-ranked Zone A.
    Result: Zone A receives 2 (unmet: 0), Zone D receives 1 (unmet: 1).
    """
    zones = [Zone(**z) for z in base_scenario_data["zones"]]
    roads = [RoadEdge(**r) for r in base_scenario_data["roads"]]
    shelters = [Shelter(**s) for s in base_scenario_data["resource_pool"]["shelters"]]
    pool = ResourcePool(
        ambulances=3,
        evacuation_vehicles=5,
        vehicle_passenger_capacity=20,
        medics=6,
        shelters=shelters,
    )
    routing_graph = RoutingGraph(roads)

    # Zone A (Rank 1, Score 88.0), Zone D (Rank 2, Score 76.0), Zone C (Rank 3), Zone B (Rank 4)
    zone_dict = {z.id: z for z in zones}
    ranked_zones = [
        create_dummy_priority(zone_dict["zone_a"], rank=1, score=88.0),
        create_dummy_priority(zone_dict["zone_d"], rank=2, score=76.0),
        create_dummy_priority(zone_dict["zone_c"], rank=3, score=62.0),
        create_dummy_priority(zone_dict["zone_b"], rank=4, score=45.0),
    ]

    # Zone A requests 2 ambulances, Zone D requests 2 ambulances
    demands = {
        "zone_a": {"ambulances": 2, "evacuation_vehicles": 4, "medics": 3, "evacuees": 70},
        "zone_d": {"ambulances": 2, "evacuation_vehicles": 4, "medics": 2, "evacuees": 80},
        "zone_c": {"ambulances": 0, "evacuation_vehicles": 4, "medics": 1, "evacuees": 80},
        "zone_b": {"ambulances": 0, "evacuation_vehicles": 2, "medics": 0, "evacuees": 40},
    }

    solver = DeterministicSolver(
        zones=zones,
        ranked_zones=ranked_zones,
        demands=demands,
        resource_pool=pool,
        routing_graph=routing_graph,
    )

    allocations, summaries, shelter_statuses, steps = solver.solve()
    alloc_map = {a.zone_id: a for a in allocations}

    # Verify Zone A
    assert alloc_map["zone_a"].ambulances.requested == 2
    assert alloc_map["zone_a"].ambulances.allocated == 2
    assert alloc_map["zone_a"].ambulances.unmet == 0

    # Verify Zone D
    assert alloc_map["zone_d"].ambulances.requested == 2
    assert alloc_map["zone_d"].ambulances.allocated == 1
    assert alloc_map["zone_d"].ambulances.unmet == 1

    # Total allocated ambulances must strictly equal pool size (3)
    amb_summary = next(s for s in summaries if s.resource == "ambulances")
    assert amb_summary.total_allocated == 3
    assert amb_summary.total_pool == 3
    assert amb_summary.total_unmet == 1


def test_determinism(base_scenario_data):
    """
    Verifies that identical inputs produce identical allocations and step logs across multiple runs.
    """
    zones = [Zone(**z) for z in base_scenario_data["zones"]]
    roads = [RoadEdge(**r) for r in base_scenario_data["roads"]]
    shelters = [Shelter(**s) for s in base_scenario_data["resource_pool"]["shelters"]]
    pool = ResourcePool(
        ambulances=3,
        evacuation_vehicles=5,
        vehicle_passenger_capacity=20,
        medics=6,
        shelters=shelters,
    )
    routing_graph = RoutingGraph(roads)

    zone_dict = {z.id: z for z in zones}
    ranked_zones = [
        create_dummy_priority(zone_dict["zone_a"], rank=1, score=85.0),
        create_dummy_priority(zone_dict["zone_d"], rank=2, score=75.0),
        create_dummy_priority(zone_dict["zone_c"], rank=3, score=60.0),
        create_dummy_priority(zone_dict["zone_b"], rank=4, score=40.0),
    ]

    demands = {
        "zone_a": {"ambulances": 2, "evacuation_vehicles": 3, "medics": 3, "evacuees": 70},
        "zone_d": {"ambulances": 2, "evacuation_vehicles": 3, "medics": 2, "evacuees": 80},
        "zone_c": {"ambulances": 1, "evacuation_vehicles": 3, "medics": 2, "evacuees": 80},
        "zone_b": {"ambulances": 1, "evacuation_vehicles": 2, "medics": 1, "evacuees": 40},
    }

    first_allocations, _, _, first_steps = DeterministicSolver(
        zones=zones,
        ranked_zones=ranked_zones,
        demands=demands,
        resource_pool=pool,
        routing_graph=routing_graph,
    ).solve()

    for _ in range(5):
        allocations, _, _, steps = DeterministicSolver(
            zones=zones,
            ranked_zones=ranked_zones,
            demands=demands,
            resource_pool=pool,
            routing_graph=routing_graph,
        ).solve()

        assert [a.model_dump() for a in allocations] == [a.model_dump() for a in first_allocations]
        assert [s.model_dump() for s in steps] == [s.model_dump() for s in first_steps]


def test_shelter_capacity_split_and_overflow(base_scenario_data):
    """
    Verifies that evacuees fill the nearest shelter first, spill over into the second shelter,
    and any excess beyond 250 total capacity is marked as unmet.
    """
    zones = [Zone(**z) for z in base_scenario_data["zones"]]
    roads = [RoadEdge(**r) for r in base_scenario_data["roads"]]
    shelters = [
        Shelter(id="shelter_north", name="North", capacity=150, current_occupancy=0, x=480, y=70),
        Shelter(id="shelter_south", name="South", capacity=100, current_occupancy=0, x=470, y=380),
    ]
    pool = ResourcePool(
        ambulances=3,
        evacuation_vehicles=5,
        vehicle_passenger_capacity=20,
        medics=6,
        shelters=shelters,
    )
    routing_graph = RoutingGraph(roads)

    # Total evac demand = 70 + 80 + 80 + 40 = 270. Capacity = 150 + 100 = 250.
    # Exactly 20 evacuees should be reported as unmet.
    zone_dict = {z.id: z for z in zones}
    ranked_zones = [
        create_dummy_priority(zone_dict["zone_a"], rank=1, score=90.0),
        create_dummy_priority(zone_dict["zone_d"], rank=2, score=80.0),
        create_dummy_priority(zone_dict["zone_c"], rank=3, score=70.0),
        create_dummy_priority(zone_dict["zone_b"], rank=4, score=50.0),
    ]

    demands = {
        z.id: {"ambulances": 1, "evacuation_vehicles": 2, "medics": 1, "evacuees": z.evacuation_demand}
        for z in zones
    }

    solver = DeterministicSolver(
        zones=zones,
        ranked_zones=ranked_zones,
        demands=demands,
        resource_pool=pool,
        routing_graph=routing_graph,
    )

    allocations, summaries, shelter_statuses, steps = solver.solve()

    total_sheltered = sum(a.evacuees_sheltered for a in allocations)
    total_unmet = sum(a.evacuees_unmet for a in allocations)

    assert total_sheltered == 250
    assert total_unmet == 20
    assert all(s.allocated_count <= s.capacity for s in shelter_statuses)


def test_property_200_random_scenarios(base_scenario_data):
    """
    Property-style randomized test over 200 random scenarios.
    Checks that solver hard invariants are NEVER violated under any random combination
    of zone demands, priorities, resource pools, and shelter sizes.
    """
    rnd = random.Random(42)
    roads = [RoadEdge(**r) for r in base_scenario_data["roads"]]
    routing_graph = RoutingGraph(roads)

    for i in range(200):
        # Generate random zones
        zone_count = rnd.randint(2, 6)
        zones = []
        for z_idx in range(zone_count):
            zid = f"zone_{chr(97 + z_idx)}"
            zones.append(
                Zone(
                    id=zid,
                    name=f"Zone {zid}",
                    population=rnd.randint(100, 1000),
                    flood_severity=rnd.randint(1, 5),
                    injured=rnd.randint(0, 50),
                    critical_patients=rnd.randint(0, 20),
                    vulnerable_population=rnd.randint(10, 200),
                    evacuation_demand=rnd.randint(0, 150),
                    x=rnd.uniform(50, 500),
                    y=rnd.uniform(50, 500),
                )
            )

        # Connect new zones if needed to road graph
        test_roads = list(roads)
        for z in zones:
            test_roads.append(
                RoadEdge(
                    from_node=z.id,
                    to_node="shelter_north",
                    distance_km=rnd.uniform(2.0, 15.0),
                    travel_minutes=rnd.uniform(5.0, 30.0),
                    status="open",
                )
            )
        current_graph = RoutingGraph(test_roads)

        # Random resource pool
        pool_amb = rnd.randint(1, 10)
        pool_veh = rnd.randint(1, 10)
        pool_med = rnd.randint(1, 15)
        shelter_cap1 = rnd.randint(50, 300)
        shelter_cap2 = rnd.randint(50, 300)

        pool = ResourcePool(
            ambulances=pool_amb,
            evacuation_vehicles=pool_veh,
            vehicle_passenger_capacity=20,
            medics=pool_med,
            shelters=[
                Shelter(id="shelter_north", name="Shelter North", capacity=shelter_cap1, x=480, y=70),
                Shelter(id="shelter_south", name="Shelter South", capacity=shelter_cap2, x=470, y=380),
            ],
        )

        # Random scores & ranks
        ranked_zones = []
        for idx, z in enumerate(zones):
            score = rnd.uniform(10.0, 99.0)
            ranked_zones.append(create_dummy_priority(z, rank=idx + 1, score=score))

        # Random demands
        demands = {}
        for z in zones:
            demands[z.id] = {
                "ambulances": rnd.randint(0, 5),
                "evacuation_vehicles": rnd.randint(0, 8),
                "medics": rnd.randint(0, 6),
                "evacuees": z.evacuation_demand,
            }

        solver = DeterministicSolver(
            zones=zones,
            ranked_zones=ranked_zones,
            demands=demands,
            resource_pool=pool,
            routing_graph=current_graph,
        )

        # Solve and check invariants
        allocations, summaries, shelter_statuses, steps = solver.solve()

        # Hard invariant assertions
        sum_amb = sum(a.ambulances.allocated for a in allocations)
        sum_veh = sum(a.evacuation_vehicles.allocated for a in allocations)
        sum_med = sum(a.medics.allocated for a in allocations)

        assert sum_amb <= pool.ambulances, f"Iteration {i}: Ambulances over-allocated!"
        assert sum_veh <= pool.evacuation_vehicles, f"Iteration {i}: Vehicles over-allocated!"
        assert sum_med <= pool.medics, f"Iteration {i}: Medics over-allocated!"

        for a in allocations:
            assert a.ambulances.allocated >= 0
            assert a.ambulances.unmet >= 0
            assert a.ambulances.requested == (a.ambulances.allocated + a.ambulances.unmet)

            assert a.evacuation_vehicles.allocated >= 0
            assert a.evacuation_vehicles.unmet >= 0
            assert a.evacuation_vehicles.requested == (a.evacuation_vehicles.allocated + a.evacuation_vehicles.unmet)

            assert a.medics.allocated >= 0
            assert a.medics.unmet >= 0
            assert a.medics.requested == (a.medics.allocated + a.medics.unmet)

        for s in shelter_statuses:
            assert s.allocated_count <= s.capacity, f"Iteration {i}: Shelter capacity exceeded!"
            assert s.allocated_count >= 0


def test_zone_e_replan_solver(base_scenario_data, zone_e_data):
    """
    Tests solver re-plan behavior when Zone E (critical flood severity 5) is added to the system.
    Zone E should claim top priority and force redistribution of ambulances.
    """
    zones = [Zone(**z) for z in base_scenario_data["zones"]]
    roads = [RoadEdge(**r) for r in base_scenario_data["roads"]]
    shelters = [Shelter(**s) for s in base_scenario_data["resource_pool"]["shelters"]]
    pool = ResourcePool(
        ambulances=3,
        evacuation_vehicles=5,
        vehicle_passenger_capacity=20,
        medics=6,
        shelters=shelters,
    )

    # Add Zone E
    zone_e = Zone(**zone_e_data["zone"])
    zones.append(zone_e)
    for r in zone_e_data["new_roads"]:
        roads.append(RoadEdge(**r))

    routing_graph = RoutingGraph(roads)

    # Zone E has highest score due to severity 5 and 14 critical patients
    zone_dict = {z.id: z for z in zones}
    ranked_zones = [
        create_dummy_priority(zone_dict["zone_e"], rank=1, score=96.0),
        create_dummy_priority(zone_dict["zone_a"], rank=2, score=85.0),
        create_dummy_priority(zone_dict["zone_d"], rank=3, score=74.0),
        create_dummy_priority(zone_dict["zone_c"], rank=4, score=60.0),
        create_dummy_priority(zone_dict["zone_b"], rank=5, score=40.0),
    ]

    # Demands: Zone E requests 2 ambulances, Zone A requests 2, Zone D requests 2 (total 6 vs 3 pool)
    demands = {
        "zone_e": {"ambulances": 2, "evacuation_vehicles": 6, "medics": 4, "evacuees": 110},
        "zone_a": {"ambulances": 2, "evacuation_vehicles": 4, "medics": 3, "evacuees": 70},
        "zone_d": {"ambulances": 2, "evacuation_vehicles": 4, "medics": 2, "evacuees": 80},
        "zone_c": {"ambulances": 0, "evacuation_vehicles": 4, "medics": 1, "evacuees": 80},
        "zone_b": {"ambulances": 0, "evacuation_vehicles": 2, "medics": 0, "evacuees": 40},
    }

    solver = DeterministicSolver(
        zones=zones,
        ranked_zones=ranked_zones,
        demands=demands,
        resource_pool=pool,
        routing_graph=routing_graph,
    )

    allocations, summaries, shelter_statuses, steps = solver.solve()
    alloc_map = {a.zone_id: a for a in allocations}

    # Pass 1 gives 1 each to E, A, D (3 total).
    # Pass 2 has 0 remaining!
    # So E gets 1 (1 unmet), A gets 1 (1 unmet), D gets 1 (1 unmet)!
    assert alloc_map["zone_e"].ambulances.allocated == 1
    assert alloc_map["zone_a"].ambulances.allocated == 1
    assert alloc_map["zone_d"].ambulances.allocated == 1

    amb_summary = next(s for s in summaries if s.resource == "ambulances")
    assert amb_summary.total_allocated == 3
    assert amb_summary.total_unmet == 3

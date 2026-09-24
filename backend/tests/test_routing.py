"""
Unit and property-based invariant tests for the routing engine.
"""

import pytest
from backend.app.models import RoadEdge, Shelter
from backend.app.routing import RoutingGraph


def test_dijkstra_finds_shortest_path():
    roads = [
        RoadEdge(from_node="A", to_node="B", distance_km=5.0, travel_minutes=10.0, status="open"),
        RoadEdge(from_node="B", to_node="C", distance_km=5.0, travel_minutes=10.0, status="open"),
        RoadEdge(from_node="A", to_node="C", distance_km=12.0, travel_minutes=30.0, status="open"),
    ]
    graph = RoutingGraph(roads)
    route = graph.find_shortest_path("A", "C")
    assert route is not None
    assert route.path == ["A", "B", "C"]
    assert route.total_travel_minutes == 20.0
    assert route.total_distance_km == 10.0


def test_dijkstra_avoids_blocked_roads():
    # Direct road A -> C is blocked
    roads = [
        RoadEdge(from_node="A", to_node="C", distance_km=2.0, travel_minutes=5.0, status="blocked"),
        RoadEdge(from_node="A", to_node="B", distance_km=4.0, travel_minutes=8.0, status="open"),
        RoadEdge(from_node="B", to_node="C", distance_km=4.0, travel_minutes=8.0, status="open"),
    ]
    graph = RoutingGraph(roads)
    route = graph.find_shortest_path("A", "C")
    assert route is not None
    assert route.path == ["A", "B", "C"]
    assert route.total_travel_minutes == 16.0
    assert route.is_alternate_route is True
    assert route.blocked_direct_detected is True


def test_dijkstra_unreachable_node():
    roads = [
        RoadEdge(from_node="A", to_node="B", distance_km=3.0, travel_minutes=5.0, status="open"),
        RoadEdge(from_node="C", to_node="D", distance_km=4.0, travel_minutes=6.0, status="open"),
    ]
    graph = RoutingGraph(roads)
    route = graph.find_shortest_path("A", "D")
    assert route is None


def test_shelter_routes_sorted():
    roads = [
        RoadEdge(from_node="Z1", to_node="S1", distance_km=10.0, travel_minutes=25.0, status="open"),
        RoadEdge(from_node="Z1", to_node="S2", distance_km=4.0, travel_minutes=10.0, status="open"),
    ]
    shelters = [
        Shelter(id="S1", name="Shelter 1", capacity=100, x=0, y=0),
        Shelter(id="S2", name="Shelter 2", capacity=100, x=0, y=0),
    ]
    graph = RoutingGraph(roads)
    sorted_shelters = graph.find_shelter_routes("Z1", shelters)
    assert len(sorted_shelters) == 2
    assert sorted_shelters[0][0].id == "S2"
    assert sorted_shelters[1][0].id == "S1"

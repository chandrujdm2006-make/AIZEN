"""
Routing engine for disaster response navigation.
Implements Dijkstra's algorithm over road networks with blocked road avoidance
and travel-time optimization.
"""

from typing import List, Dict, Tuple, Optional
import heapq
from pydantic import BaseModel, Field
from backend.app.models import RoadEdge, Shelter


class RouteResult(BaseModel):
    start_node: str
    end_node: str
    path: List[str]
    total_distance_km: float
    total_travel_minutes: float
    has_flooded_segments: bool = False
    is_alternate_route: bool = False
    blocked_direct_detected: bool = False


class RoutingGraph:
    def __init__(self, roads: List[RoadEdge]):
        self.roads = roads
        self.adjacency: Dict[str, List[Tuple[str, float, float, str]]] = {}
        self._build_graph()

    def _build_graph(self):
        for road in self.roads:
            if road.from_node not in self.adjacency:
                self.adjacency[road.from_node] = []
            if road.to_node not in self.adjacency:
                self.adjacency[road.to_node] = []

            # Roads are bidirectional
            self.adjacency[road.from_node].append(
                (road.to_node, road.travel_minutes, road.distance_km, road.status)
            )
            self.adjacency[road.to_node].append(
                (road.from_node, road.travel_minutes, road.distance_km, road.status)
            )

    def find_shortest_path(
        self, start: str, end: str, allow_blocked: bool = False
    ) -> Optional[RouteResult]:
        """
        Dijkstra's algorithm minimizing travel_minutes.
        Filters out 'blocked' edges unless allow_blocked=True (for counterfactual checks).
        """
        if start == end:
            return RouteResult(
                start_node=start,
                end_node=end,
                path=[start],
                total_distance_km=0.0,
                total_travel_minutes=0.0,
                has_flooded_segments=False,
            )

        # Check if direct edge existed and was blocked
        blocked_direct_detected = False
        for road in self.roads:
            if (road.from_node == start and road.to_node == end) or (
                road.from_node == end and road.to_node == start
            ):
                if road.status == "blocked":
                    blocked_direct_detected = True

        # Priority queue stores (travel_time, current_node, path, distance, has_flooded)
        queue: List[Tuple[float, str, List[str], float, bool]] = [
            (0.0, start, [start], 0.0, False)
        ]
        visited: Dict[str, float] = {}

        while queue:
            current_time, u, path, dist, has_flood = heapq.heappop(queue)

            if u in visited and visited[u] <= current_time:
                continue
            visited[u] = current_time

            if u == end:
                return RouteResult(
                    start_node=start,
                    end_node=end,
                    path=path,
                    total_distance_km=round(dist, 2),
                    total_travel_minutes=round(current_time, 2),
                    has_flooded_segments=has_flood,
                    is_alternate_route=blocked_direct_detected,
                    blocked_direct_detected=blocked_direct_detected,
                )

            for neighbor, edge_time, edge_dist, status in self.adjacency.get(u, []):
                if status == "blocked" and not allow_blocked:
                    continue

                new_has_flood = has_flood or (status == "flooded")
                new_time = current_time + edge_time
                new_dist = dist + edge_dist

                if neighbor not in visited or visited[neighbor] > new_time:
                    heapq.heappush(
                        queue,
                        (
                            new_time,
                            neighbor,
                            path + [neighbor],
                            new_dist,
                            new_has_flood,
                        ),
                    )

        return None

    def find_shelter_routes(
        self, zone_id: str, shelters: List[Shelter]
    ) -> List[Tuple[Shelter, RouteResult]]:
        """
        Calculates routes from a zone to all reachable shelters, sorted by travel time.
        """
        results: List[Tuple[Shelter, RouteResult]] = []
        for shelter in shelters:
            route = self.find_shortest_path(zone_id, shelter.id)
            if route:
                results.append((shelter, route))

        # Sort by travel minutes
        results.sort(key=lambda item: item[1].total_travel_minutes)
        return results

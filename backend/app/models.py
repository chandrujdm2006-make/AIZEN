"""
Pydantic data models for the Multi-Agent Disaster Response Coordinator.
Supports strict validation and serialization for all components.
"""

from typing import List, Dict, Optional, Literal, Any
from pydantic import BaseModel, Field


class Zone(BaseModel):
    id: str = Field(..., description="Unique zone identifier, e.g. 'zone_a'")
    name: str = Field(..., description="Human-readable zone name")
    population: int = Field(..., ge=0)
    flood_severity: int = Field(..., ge=1, le=10, description="Flood severity scale 1-10")
    injured: int = Field(..., ge=0)
    critical_patients: int = Field(..., ge=0)
    vulnerable_population: int = Field(..., ge=0, description="Elderly, children, disabled")
    evacuation_demand: int = Field(..., ge=0, description="Number of people needing evacuation")
    x: float = Field(..., description="Map X coordinate (SVG canvas units)")
    y: float = Field(..., description="Map Y coordinate (SVG canvas units)")
    vulnerable_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="Vulnerable population percentage (0-100)")
    priority_override: Optional[float] = Field(None, ge=0.0, le=100.0, description="Manual priority override (0-100)")
    is_scale_10: bool = Field(default=False, description="True if flood severity is recorded on a 1-10 scale")



class RoadEdge(BaseModel):
    from_node: str
    to_node: str
    distance_km: float = Field(..., ge=0.0)
    travel_minutes: float = Field(..., ge=0.0)
    status: Literal["open", "flooded", "blocked"] = "open"


class Shelter(BaseModel):
    id: str
    name: str
    capacity: int = Field(..., ge=0)
    current_occupancy: int = Field(default=0, ge=0)
    x: float
    y: float


class Depot(BaseModel):
    id: str = "depot_1"
    name: str = "Emergency Command Depot"
    x: float = 100.0
    y: float = 250.0


class ResourcePool(BaseModel):
    ambulances: int = Field(default=3, ge=0)
    evacuation_vehicles: int = Field(default=5, ge=0)
    vehicle_passenger_capacity: int = Field(default=20, ge=1)
    medics: int = Field(default=6, ge=0)
    shelters: List[Shelter] = Field(default_factory=list)


class ScenarioState(BaseModel):
    scenario_id: str = "flood_base"
    title: str = "Metropolitan Riverine Flash Flood"
    description: str = "Severe monsoon flash flood impacting zones across the river basin."
    depot: Depot = Field(default_factory=Depot)
    zones: List[Zone]
    roads: List[RoadEdge]
    resource_pool: ResourcePool


# Priority Scoring Models
class PriorityFactorBreakdown(BaseModel):
    severity_component: float
    critical_patients_component: float
    vulnerable_component: float
    population_component: float
    evac_demand_component: float
    total_score: float = Field(..., ge=0.0, le=100.0)


class ZonePriority(BaseModel):
    zone_id: str
    zone_name: str
    score: float
    rank: int
    breakdown: PriorityFactorBreakdown


# Agent Recommendation Models
class LogisticsZoneRecommendation(BaseModel):
    zone_id: str
    requested_evac_vehicles: int = Field(..., ge=0)
    preferred_shelter_id: str
    route_node_path: List[str] = Field(default_factory=list)
    estimated_travel_minutes: float = 0.0
    is_alternate_route: bool = False
    notes: str
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class LogisticsRecommendation(BaseModel):
    agent_name: str = "Logistics Agent"
    zone_requests: List[LogisticsZoneRecommendation]
    blocked_route_warnings: List[str] = Field(default_factory=list)
    shelter_capacity_warnings: List[str] = Field(default_factory=list)
    mode: Literal["live_llm", "fallback_mock"] = "fallback_mock"


class MedicalZoneRecommendation(BaseModel):
    zone_id: str
    medical_severity: int = Field(..., ge=1, le=5)
    requested_ambulances: int = Field(..., ge=0)
    requested_medics: int = Field(..., ge=0)
    triage_notes: str
    vulnerable_group_concerns: str
    urgency: float = Field(default=0.9, ge=0.0, le=1.0)


class MedicalRecommendation(BaseModel):
    agent_name: str = "Medical Agent"
    zone_requests: List[MedicalZoneRecommendation]
    critical_triage_alerts: List[str] = Field(default_factory=list)
    mode: Literal["live_llm", "fallback_mock"] = "fallback_mock"


# Conflict Models
class Conflict(BaseModel):
    id: str
    conflict_type: Literal[
        "resource_shortage",
        "contested_resource",
        "shelter_overflow",
        "blocked_route_hazard",
    ]
    resource_type: str  # "ambulances", "evacuation_vehicles", "medics", "shelter", "road"
    zones_involved: List[str]
    total_demand: float
    total_supply: float
    description: str
    resolved_allocation_summary: Optional[str] = None
    resolution_rationale: Optional[str] = None


# Solver & Allocation Models
class ResourceAllocation(BaseModel):
    requested: int = 0
    allocated: int = 0
    unmet: int = 0


class ShelterEvacuationAssignment(BaseModel):
    shelter_id: str
    shelter_name: str
    evacuees_assigned: int
    route_path: List[str]
    distance_km: float
    travel_minutes: float


class ZoneAllocation(BaseModel):
    zone_id: str
    zone_name: str
    priority_rank: int
    priority_score: float
    ambulances: ResourceAllocation
    evacuation_vehicles: ResourceAllocation
    medics: ResourceAllocation
    evacuees_sheltered: int
    evacuees_unmet: int
    shelter_assignments: List[ShelterEvacuationAssignment] = Field(default_factory=list)
    rationale: str = ""


class SolverStep(BaseModel):
    step_number: int
    action_type: str
    description: str
    zone_id: Optional[str] = None
    resource: Optional[str] = None
    quantity: Optional[int] = None
    remaining_pool: Optional[int] = None


class DecisionTrace(BaseModel):
    initial_demands: Dict[str, Dict[str, int]]
    conflicts_detected: List[str]
    solver_steps: List[SolverStep]
    final_tradeoffs: List[str]


# Communication & Public Alert Models
class ZoneAlert(BaseModel):
    zone_id: str
    zone_name: str
    urgency_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    sms_text: str
    evacuation_instructions: str
    shelter_info: str
    route_hazards: str
    precautions: str
    what_changed: Optional[str] = None


class CommunicationPlan(BaseModel):
    agent_name: str = "Communication Agent"
    general_broadcast_alert: str
    zone_alerts: List[ZoneAlert]
    mode: Literal["live_llm", "fallback_mock"] = "fallback_mock"


# Complete Coordinated Response Plan
class ShelterStatus(BaseModel):
    id: str
    name: str
    capacity: int
    allocated_count: int
    remaining_capacity: int
    saturation_percentage: float


class ResourceUsageSummary(BaseModel):
    resource: str
    total_pool: int
    total_allocated: int
    total_unmet: int
    utilization_percentage: float


class CoordinatedPlan(BaseModel):
    plan_id: str
    plan_version: int = 1
    timestamp: str
    scenario_id: str
    zones_ranked: List[ZonePriority]
    logistics_recommendations: LogisticsRecommendation
    medical_recommendations: MedicalRecommendation
    communication_plan: CommunicationPlan
    conflicts: List[Conflict]
    allocations: List[ZoneAllocation]
    resource_summaries: List[ResourceUsageSummary]
    shelter_statuses: List[ShelterStatus]
    decision_trace: DecisionTrace
    is_approved: bool = False
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    agent_execution_modes: Dict[str, str] = Field(default_factory=dict)


# Dynamic Re-planning Diff Models
class ZoneAllocationDiff(BaseModel):
    zone_id: str
    zone_name: str
    ambulance_diff: int
    vehicle_diff: int
    medic_diff: int
    evacuee_diff: int
    priority_rank_old: Optional[int]
    priority_rank_new: int
    reason: str


class ReplanDiff(BaseModel):
    old_version: int
    new_version: int
    newly_added_zones: List[str]
    allocation_diffs: List[ZoneAllocationDiff]
    summary_of_changes: List[str]


class AddZoneRequest(BaseModel):
    zone: Optional[Zone] = None
    new_roads: List[RoadEdge] = Field(default_factory=list)


class PlanApprovalRequest(BaseModel):
    commander_name: str
    notes: Optional[str] = "Approved after operational review."


# --- DYNAMIC CONTROL PANEL MODELS ---
class ZoneControlUpdate(BaseModel):
    id: str
    name: str
    population: int = Field(..., ge=0)
    evacuation_demand: int = Field(..., ge=0)
    injured: int = Field(..., ge=0)
    critical_patients: int = Field(..., ge=0)
    flood_severity: int = Field(..., ge=1, le=10)
    vulnerable_percent: float = Field(..., ge=0.0, le=100.0)
    priority_override: Optional[float] = Field(None, ge=0.0, le=100.0)


class GlobalPoolControlUpdate(BaseModel):
    ambulances: int = Field(..., ge=0)
    evacuation_vehicles: int = Field(..., ge=0)
    medics: int = Field(..., ge=0)
    shelter_capacity: int = Field(..., ge=0)


class ZoneManualAllocation(BaseModel):
    zone_id: str
    assigned_ambulances: int = Field(..., ge=0)
    assigned_evacuation_vehicles: int = Field(..., ge=0)
    assigned_medics: int = Field(..., ge=0)
    assigned_shelter_spaces: int = Field(..., ge=0)


class ControlPanelSyncRequest(BaseModel):
    zones: List[ZoneControlUpdate]
    resources: GlobalPoolControlUpdate
    manual_allocations: Optional[List[ZoneManualAllocation]] = None
    auto_replan: bool = True
    commander_name: Optional[str] = "Emergency Commander"


class ControlPanelConflictWarning(BaseModel):
    type: Literal["error", "warning", "info"]
    resource_or_zone: str
    message: str
    details: Optional[str] = None


class ControlPanelStateResponse(BaseModel):
    zones: List[Zone]
    resource_pool: ResourcePool
    current_allocations: List[ZoneAllocation]
    zones_ranked: List[ZonePriority]
    utilization: Dict[str, float]
    conflicts: List[ControlPanelConflictWarning]
    total_shelter_capacity: int
    total_shelter_allocated: int
    is_replan_active: bool = False

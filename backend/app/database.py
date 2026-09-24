"""
SQLite Database Layer for Multi-Agent Disaster Response Coordinator.
Supports audit persistence for zones, resources, vehicles, shelters, allocations,
agent recommendations, alerts, and operational events.
Designed to easily swap to PostgreSQL with minimal schema changes.
"""

import sqlite3
import json
import os
from pathlib import Path
from typing import Dict, List, Any, Optional

DB_PATH = Path(__file__).parent.parent / "data" / "disaster_coordinator.db"


def get_connection():
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Zones table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS zones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        population INTEGER NOT NULL,
        flood_severity INTEGER NOT NULL,
        injured INTEGER NOT NULL,
        critical_patients INTEGER NOT NULL,
        vulnerable_population INTEGER NOT NULL,
        evacuation_demand INTEGER NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        z REAL DEFAULT 0.0,
        vulnerable_percent REAL,
        priority_override REAL,
        is_scale_10 INTEGER DEFAULT 0
    )
    """)

    # Safe migration for existing tables if columns missing
    cursor.execute("PRAGMA table_info(zones)")
    existing_cols = [row[1] for row in cursor.fetchall()]
    if "vulnerable_percent" not in existing_cols:
        cursor.execute("ALTER TABLE zones ADD COLUMN vulnerable_percent REAL")
    if "priority_override" not in existing_cols:
        cursor.execute("ALTER TABLE zones ADD COLUMN priority_override REAL")
    if "is_scale_10" not in existing_cols:
        cursor.execute("ALTER TABLE zones ADD COLUMN is_scale_10 INTEGER DEFAULT 0")


    # 2. Resources table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        total_pool INTEGER NOT NULL,
        available_pool INTEGER NOT NULL,
        unit_type TEXT NOT NULL
    )
    """)

    # 3. Vehicles table (for animated 3D tracking)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- ambulance, evac_vehicle, rescue_boat, drone
        capacity INTEGER NOT NULL,
        status TEXT NOT NULL, -- idle, en_route_pickup, en_route_dropoff
        current_x REAL NOT NULL,
        current_y REAL NOT NULL,
        current_z REAL NOT NULL,
        target_zone TEXT,
        target_shelter TEXT
    )
    """)

    # 4. Medical cases table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS medical_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_id TEXT NOT NULL,
        patient_count INTEGER NOT NULL,
        critical_count INTEGER NOT NULL,
        triage_status TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (zone_id) REFERENCES zones(id)
    )
    """)

    # 5. Shelters table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS shelters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        current_occupancy INTEGER NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        z REAL DEFAULT 0.0
    )
    """)

    # 6. Allocations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_version INTEGER NOT NULL,
        zone_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        requested INTEGER NOT NULL,
        allocated INTEGER NOT NULL,
        unmet INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 7. Agent recommendations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agent_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_version INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        zone_id TEXT,
        payload_json TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 8. Alerts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_version INTEGER NOT NULL,
        zone_id TEXT NOT NULL,
        urgency_level TEXT NOT NULL,
        sms_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 9. Events table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 10. Control panel logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS control_panel_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        commander_name TEXT,
        action_type TEXT,
        zones_json TEXT,
        resources_json TEXT,
        allocations_json TEXT,
        status TEXT
    )
    """)

    conn.commit()
    conn.close()



def seed_db_from_base_scenario():
    """Seeds the SQLite database with the baseline scenario data."""
    init_db()
    base_json_path = Path(__file__).parent.parent / "data" / "scenario_base.json"
    with open(base_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    conn = get_connection()
    cursor = conn.cursor()

    # Clear existing baseline data
    cursor.execute("DELETE FROM zones")
    cursor.execute("DELETE FROM resources")
    cursor.execute("DELETE FROM shelters")
    cursor.execute("DELETE FROM vehicles")

    # Insert zones
    for z in data["zones"]:
        cursor.execute("""
        INSERT INTO zones (id, name, population, flood_severity, injured, critical_patients, vulnerable_population, evacuation_demand, x, y, z)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (z["id"], z["name"], z["population"], z["flood_severity"], z["injured"], z["critical_patients"], z["vulnerable_population"], z["evacuation_demand"], z["x"], z["y"], 0.0))

    # Insert resources
    pool = data["resource_pool"]
    cursor.execute("INSERT INTO resources (id, name, total_pool, available_pool, unit_type) VALUES (?, ?, ?, ?, ?)",
                   ("ambulances", "Emergency Ambulances", pool["ambulances"], pool["ambulances"], "unit"))
    cursor.execute("INSERT INTO resources (id, name, total_pool, available_pool, unit_type) VALUES (?, ?, ?, ?, ?)",
                   ("evacuation_vehicles", "Evacuation Vehicles", pool["evacuation_vehicles"], pool["evacuation_vehicles"], "bus"))
    cursor.execute("INSERT INTO resources (id, name, total_pool, available_pool, unit_type) VALUES (?, ?, ?, ?, ?)",
                   ("medics", "Field Paramedics", pool["medics"], pool["medics"], "person"))

    # Insert shelters
    for s in pool["shelters"]:
        cursor.execute("""
        INSERT INTO shelters (id, name, capacity, current_occupancy, x, y, z)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (s["id"], s["name"], s["capacity"], s["current_occupancy"], s["x"], s["y"], 0.0))

    # Insert active animated emergency vehicles
    vehicles = [
        ("amb_1", "ambulance", 2, "en_route_pickup", 80.0, 250.0, 0.0, "zone_a", "shelter_north"),
        ("amb_2", "ambulance", 2, "en_route_pickup", 80.0, 250.0, 0.0, "zone_a", "shelter_north"),
        ("amb_3", "ambulance", 2, "en_route_pickup", 80.0, 250.0, 0.0, "zone_d", "shelter_south"),
        ("evac_1", "evac_vehicle", 20, "en_route_pickup", 200.0, 120.0, 0.0, "zone_a", "shelter_north"),
        ("evac_2", "evac_vehicle", 20, "en_route_pickup", 280.0, 230.0, 0.0, "zone_b", "shelter_south"),
        ("evac_3", "evac_vehicle", 20, "en_route_pickup", 420.0, 170.0, 0.0, "zone_c", "shelter_north"),
        ("evac_4", "evac_vehicle", 20, "en_route_pickup", 220.0, 360.0, 0.0, "zone_d", "shelter_south"),
        ("evac_5", "evac_vehicle", 20, "en_route_pickup", 220.0, 360.0, 0.0, "zone_d", "shelter_south"),
        ("boat_1", "rescue_boat", 6, "patrolling", 190.0, 150.0, 0.0, "zone_a", None),
        ("boat_2", "rescue_boat", 6, "patrolling", 310.0, 210.0, 0.0, "zone_b", None),
        ("drone_1", "drone", 0, "surveying", 250.0, 200.0, 50.0, "zone_a", None),
        ("drone_2", "drone", 0, "surveying", 300.0, 280.0, 50.0, "zone_d", None),
    ]
    for v in vehicles:
        cursor.execute("""
        INSERT INTO vehicles (id, type, capacity, status, current_x, current_y, current_z, target_zone, target_shelter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, v)

    cursor.execute("INSERT INTO events (event_type, payload_json) VALUES (?, ?)",
                   ("SCENARIO_SEEDED", json.dumps({"scenario_id": data["scenario_id"]})))

    conn.commit()
    conn.close()


def log_event(event_type: str, payload: Dict[str, Any]):
    init_db()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO events (event_type, payload_json) VALUES (?, ?)",
                   (event_type, json.dumps(payload)))
    conn.commit()
    conn.close()


def update_zone_in_db(z: Dict[str, Any]):
    """Inserts or updates a zone in SQLite."""
    init_db()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO zones (id, name, population, flood_severity, injured, critical_patients, 
                       vulnerable_population, evacuation_demand, x, y, z, vulnerable_percent, priority_override, is_scale_10)
    VALUES (:id, :name, :population, :flood_severity, :injured, :critical_patients, 
            :vulnerable_population, :evacuation_demand, :x, :y, :z, :vulnerable_percent, :priority_override, :is_scale_10)
    ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        population=excluded.population,
        flood_severity=excluded.flood_severity,
        injured=excluded.injured,
        critical_patients=excluded.critical_patients,
        vulnerable_population=excluded.vulnerable_population,
        evacuation_demand=excluded.evacuation_demand,
        vulnerable_percent=excluded.vulnerable_percent,
        priority_override=excluded.priority_override,
        is_scale_10=excluded.is_scale_10
    """, {
        "id": z.get("id"),
        "name": z.get("name"),
        "population": z.get("population", 0),
        "flood_severity": z.get("flood_severity", 1),
        "injured": z.get("injured", 0),
        "critical_patients": z.get("critical_patients", 0),
        "vulnerable_population": z.get("vulnerable_population", 0),
        "evacuation_demand": z.get("evacuation_demand", 0),
        "x": z.get("x", 200.0),
        "y": z.get("y", 200.0),
        "z": z.get("z", 0.0),
        "vulnerable_percent": z.get("vulnerable_percent"),
        "priority_override": z.get("priority_override"),
        "is_scale_10": 1 if z.get("is_scale_10") else 0,
    })
    conn.commit()
    conn.close()


def update_resource_pool_in_db(pool_dict: Dict[str, Any]):
    """Updates global resource totals in SQLite."""
    init_db()
    conn = get_connection()
    cursor = conn.cursor()
    if "ambulances" in pool_dict:
        cursor.execute("UPDATE resources SET total_pool = ?, available_pool = ? WHERE id = 'ambulances'",
                       (pool_dict["ambulances"], pool_dict["ambulances"]))
    if "evacuation_vehicles" in pool_dict:
        cursor.execute("UPDATE resources SET total_pool = ?, available_pool = ? WHERE id = 'evacuation_vehicles'",
                       (pool_dict["evacuation_vehicles"], pool_dict["evacuation_vehicles"]))
    if "medics" in pool_dict:
        cursor.execute("UPDATE resources SET total_pool = ?, available_pool = ? WHERE id = 'medics'",
                       (pool_dict["medics"], pool_dict["medics"]))
    conn.commit()
    conn.close()


def save_control_panel_log(
    commander_name: str,
    action_type: str,
    zones_data: Any,
    resources_data: Any,
    allocations_data: Any,
    status: str = "success"
) -> int:
    """Stores audit log entry for commander adjustments."""
    init_db()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO control_panel_logs (commander_name, action_type, zones_json, resources_json, allocations_json, status)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        commander_name,
        action_type,
        json.dumps(zones_data) if zones_data else None,
        json.dumps(resources_data) if resources_data else None,
        json.dumps(allocations_data) if allocations_data else None,
        status,
    ))
    log_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return log_id


# Ensure tables are initialized on import
init_db()


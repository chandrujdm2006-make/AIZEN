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
        z REAL DEFAULT 0.0
    )
    """)

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


# Ensure tables are initialized on import
init_db()

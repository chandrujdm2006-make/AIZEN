"""
WebSocket Connection Manager for real-time live dispatches and 3D simulation updates.
Broadcasts vehicle positions, allocation shifts, conflict triggers, and re-planning alerts.
"""

from typing import List
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger("coordinator.ws")


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        dead_connections = []
        payload = json.dumps(message)
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                dead_connections.append(connection)

        for dc in dead_connections:
            self.disconnect(dc)


ws_manager = ConnectionManager()

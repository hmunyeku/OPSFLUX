"""
Gestionnaire de connexions WebSocket pour les notifications en temps réel.
"""

from typing import Dict, Set
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    """Gestionnaire des connexions WebSocket par utilisateur."""

    def __init__(self):
        # Dict mapping user_id to set of websocket connections
        self.active_connections: Dict[UUID, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: UUID):
        """Ajoute une connexion WebSocket pour un utilisateur."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: UUID):
        """Retire une connexion WebSocket pour un utilisateur."""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: str, user_id: UUID):
        """Envoie un message à toutes les connexions d'un utilisateur."""
        if user_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message)
                except Exception:
                    # Connection is broken, mark for removal
                    disconnected.add(connection)

            # Remove broken connections
            for connection in disconnected:
                self.active_connections[user_id].discard(connection)

            # Clean up if no connections left
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast(self, message: str):
        """Envoie un message à tous les utilisateurs connectés."""
        for user_id in list(self.active_connections.keys()):
            await self.send_personal_message(message, user_id)

    def get_user_connection_count(self, user_id: UUID) -> int:
        """Retourne le nombre de connexions actives pour un utilisateur."""
        return len(self.active_connections.get(user_id, set()))

    def get_total_connections(self) -> int:
        """Retourne le nombre total de connexions actives."""
        return sum(len(connections) for connections in self.active_connections.values())


# Instance globale du gestionnaire de connexions
manager = ConnectionManager()

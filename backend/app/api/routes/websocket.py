"""
Routes WebSocket pour les notifications en temps réel.
"""

import json
from datetime import UTC, datetime
from typing import Optional

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.core.websocket_manager import manager
from app.models import TokenPayload, User
from app.models_notifications import WebSocketMessage

router = APIRouter(tags=["websocket"])


async def get_user_from_token(token: str) -> Optional[User]:
    """
    Valide le token JWT et retourne l'utilisateur associé.

    Args:
        token: Token JWT

    Returns:
        User ou None si invalide
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[security.ALGORITHM])
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, Exception):
        return None

    with Session(engine) as session:
        user = session.get(User, token_data.sub)
        if not user or not user.is_active:
            return None
        return user


@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket, token: Optional[str] = None):
    """
    WebSocket endpoint pour les notifications en temps réel.

    Le token JWT doit être passé en query parameter: /ws/notifications?token=xxx

    Messages supportés:
    - Client -> Server: {"type": "ping"}
    - Server -> Client: {"type": "pong", "timestamp": "..."}
    - Server -> Client: {"type": "notification", "data": {...}}
    - Server -> Client: {"type": "error", "data": {"message": "..."}}
    """
    # Vérifier l'authentification
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Connecter le WebSocket
    await manager.connect(websocket, user.id)

    try:
        # Envoyer un message de bienvenue
        welcome_message = WebSocketMessage(
            type="connected",
            data={"message": "Connexion établie avec succès", "user_id": str(user.id)},
        )
        await websocket.send_text(welcome_message.model_dump_json())

        # Boucle de réception des messages
        while True:
            # Recevoir un message du client
            data = await websocket.receive_text()

            try:
                message_data = json.loads(data)
                message_type = message_data.get("type", "")

                # Gérer les pings
                if message_type == "ping":
                    pong_message = WebSocketMessage(
                        type="pong",
                        data={"timestamp": datetime.now(UTC).isoformat()},
                    )
                    await websocket.send_text(pong_message.model_dump_json())

                # Gérer d'autres types de messages si nécessaire
                # ...

            except json.JSONDecodeError:
                error_message = WebSocketMessage(
                    type="error",
                    data={"message": "Message JSON invalide"},
                )
                await websocket.send_text(error_message.model_dump_json())

    except WebSocketDisconnect:
        # Déconnecter le WebSocket
        manager.disconnect(websocket, user.id)
    except Exception:
        # En cas d'erreur, déconnecter proprement
        manager.disconnect(websocket, user.id)

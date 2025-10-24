"""
Service pour tracker les utilisateurs actifs en temps réel.

Ce service maintient un set d'utilisateurs uniques qui ont fait une requête
dans les dernières 5 minutes.
"""
import threading
import time
from typing import Set
from datetime import datetime, timedelta

from app.core.metrics_service import metrics_service


class ActiveUsersTracker:
    """
    Tracker des utilisateurs actifs basé sur leur activité récente.

    Un utilisateur est considéré "actif" s'il a fait une requête dans les 5 dernières minutes.
    """

    def __init__(self, inactivity_threshold_seconds: int = 300):  # 5 minutes par défaut
        """
        Args:
            inactivity_threshold_seconds: Délai d'inactivité avant qu'un utilisateur soit considéré inactif (en secondes)
        """
        self._active_users: dict[str, float] = {}  # {user_id: last_activity_timestamp}
        self._lock = threading.Lock()
        self._inactivity_threshold = inactivity_threshold_seconds

        # Démarrer le thread de nettoyage périodique
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()

    def record_activity(self, user_id: str) -> None:
        """
        Enregistre une activité pour un utilisateur.

        Args:
            user_id: L'ID de l'utilisateur (UUID ou string)
        """
        with self._lock:
            self._active_users[user_id] = time.time()
            # Mettre à jour la métrique immédiatement
            metrics_service.set_gauge("active_users", len(self._active_users))

    def get_active_count(self) -> int:
        """
        Retourne le nombre d'utilisateurs actifs actuellement.

        Returns:
            Le nombre d'utilisateurs actifs
        """
        self._cleanup_inactive_users()
        with self._lock:
            return len(self._active_users)

    def get_active_user_ids(self) -> Set[str]:
        """
        Retourne la liste des IDs d'utilisateurs actifs.

        Returns:
            Set des IDs d'utilisateurs actifs
        """
        self._cleanup_inactive_users()
        with self._lock:
            return set(self._active_users.keys())

    def _cleanup_inactive_users(self) -> None:
        """
        Nettoie les utilisateurs inactifs (qui n'ont pas fait de requête depuis X secondes).
        """
        current_time = time.time()
        threshold = current_time - self._inactivity_threshold

        with self._lock:
            # Supprimer les utilisateurs inactifs
            inactive_users = [
                user_id for user_id, last_activity in self._active_users.items()
                if last_activity < threshold
            ]

            for user_id in inactive_users:
                del self._active_users[user_id]

            # Mettre à jour la métrique si des utilisateurs ont été retirés
            if inactive_users:
                metrics_service.set_gauge("active_users", len(self._active_users))

    def _cleanup_loop(self) -> None:
        """
        Boucle de nettoyage périodique (toutes les 30 secondes).
        """
        while True:
            try:
                time.sleep(30)  # Nettoyer toutes les 30 secondes
                self._cleanup_inactive_users()
            except Exception as e:
                # En cas d'erreur, continuer silencieusement pour ne pas casser l'application
                import logging
                logging.getLogger(__name__).error(f"Error in active users cleanup loop: {e}")


# Instance globale du tracker
active_users_tracker = ActiveUsersTracker()

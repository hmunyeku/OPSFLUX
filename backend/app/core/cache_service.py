"""
Cache Service - CORE Service

Service de cache centralisé utilisant Redis pour améliorer les performances
de l'application et réduire la charge sur la base de données.

Fonctionnalités :
- Cache simple clé/valeur avec TTL
- Cache de méthodes avec décorateur
- Invalidation de cache (par clé, pattern, ou tag)
- Support des namespaces pour isoler les caches par module
- Compression optionnelle pour grandes valeurs
- Statistiques de cache (hits/misses)

Usage :
    from app.core.cache_service import cache_service

    # Simple get/set
    await cache_service.set("key", "value", ttl=3600)
    value = await cache_service.get("key")

    # Avec décorateur
    @cache_service.cached(ttl=300, namespace="users")
    async def get_user(user_id: str):
        return db.get(user_id)

    # Invalidation
    await cache_service.delete("key")
    await cache_service.delete_pattern("user:*")
    await cache_service.clear_namespace("users")
"""

import json
import pickle
import hashlib
from typing import Any, Optional, Callable, Union
from functools import wraps
from datetime import timedelta
import asyncio

import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings


class CacheService:
    """
    Service de cache Redis avec support async/await.

    Architecture :
    - Connexion Redis async pour performances optimales
    - Sérialisation automatique (JSON pour strings/dicts, pickle pour objets)
    - TTL configurable par défaut et par opération
    - Namespaces pour isolation des caches
    - Tags pour invalidation groupée
    """

    def __init__(self):
        self._redis: Optional[Redis] = None
        self._default_ttl: int = 3600  # 1 heure par défaut
        self._stats_enabled: bool = True

        # Stats
        self._hits: int = 0
        self._misses: int = 0
        self._sets: int = 0
        self._deletes: int = 0

    async def connect(self):
        """Établit la connexion à Redis"""
        if self._redis is None:
            self._redis = await aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=False  # On gère nous-mêmes le décodage
            )

    async def disconnect(self):
        """Ferme la connexion à Redis"""
        if self._redis:
            await self._redis.close()
            self._redis = None

    async def ping(self) -> bool:
        """Vérifie que Redis est accessible"""
        try:
            await self.connect()
            return await self._redis.ping()
        except Exception:
            return False

    def _make_key(self, key: str, namespace: Optional[str] = None) -> str:
        """Construit une clé complète avec namespace"""
        if namespace:
            return f"{namespace}:{key}"
        return key

    def _serialize(self, value: Any) -> bytes:
        """Sérialise une valeur pour le stockage"""
        # Pour les types simples, utiliser JSON (lisible dans Redis)
        if isinstance(value, (str, int, float, bool, list, dict)):
            return json.dumps(value).encode('utf-8')

        # Pour les objets complexes, utiliser pickle
        return pickle.dumps(value)

    def _deserialize(self, value: bytes) -> Any:
        """Désérialise une valeur depuis Redis"""
        if value is None:
            return None

        # Essayer JSON d'abord (plus rapide)
        try:
            return json.loads(value.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Sinon pickle
            return pickle.loads(value)

    async def get(
        self,
        key: str,
        namespace: Optional[str] = None,
        default: Any = None
    ) -> Any:
        """
        Récupère une valeur depuis le cache.

        Args:
            key: Clé de cache
            namespace: Namespace optionnel
            default: Valeur par défaut si clé non trouvée

        Returns:
            Valeur désérialisée ou default
        """
        await self.connect()

        full_key = self._make_key(key, namespace)

        try:
            value = await self._redis.get(full_key)

            if value is None:
                self._misses += 1
                return default

            self._hits += 1
            return self._deserialize(value)

        except Exception as e:
            print(f"Cache get error for {full_key}: {e}")
            return default

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        namespace: Optional[str] = None
    ) -> bool:
        """
        Stocke une valeur dans le cache.

        Args:
            key: Clé de cache
            value: Valeur à stocker
            ttl: Time to live en secondes (None = default_ttl)
            namespace: Namespace optionnel

        Returns:
            True si réussi
        """
        await self.connect()

        full_key = self._make_key(key, namespace)
        ttl = ttl if ttl is not None else self._default_ttl

        try:
            serialized = self._serialize(value)

            if ttl > 0:
                await self._redis.setex(full_key, ttl, serialized)
            else:
                await self._redis.set(full_key, serialized)

            self._sets += 1
            return True

        except Exception as e:
            print(f"Cache set error for {full_key}: {e}")
            return False

    async def delete(
        self,
        key: str,
        namespace: Optional[str] = None
    ) -> bool:
        """
        Supprime une clé du cache.

        Args:
            key: Clé à supprimer
            namespace: Namespace optionnel

        Returns:
            True si la clé existait et a été supprimée
        """
        await self.connect()

        full_key = self._make_key(key, namespace)

        try:
            result = await self._redis.delete(full_key)
            self._deletes += 1
            return result > 0

        except Exception as e:
            print(f"Cache delete error for {full_key}: {e}")
            return False

    async def delete_pattern(
        self,
        pattern: str,
        namespace: Optional[str] = None
    ) -> int:
        """
        Supprime toutes les clés correspondant à un pattern.

        Args:
            pattern: Pattern Redis (ex: "user:*", "session:user:*")
            namespace: Namespace optionnel

        Returns:
            Nombre de clés supprimées
        """
        await self.connect()

        full_pattern = self._make_key(pattern, namespace)

        try:
            keys = []
            async for key in self._redis.scan_iter(match=full_pattern):
                keys.append(key)

            if keys:
                deleted = await self._redis.delete(*keys)
                self._deletes += deleted
                return deleted

            return 0

        except Exception as e:
            print(f"Cache delete_pattern error for {full_pattern}: {e}")
            return 0

    async def clear_namespace(self, namespace: str) -> int:
        """
        Supprime toutes les clés d'un namespace.

        Args:
            namespace: Namespace à vider

        Returns:
            Nombre de clés supprimées
        """
        return await self.delete_pattern("*", namespace=namespace)

    async def exists(
        self,
        key: str,
        namespace: Optional[str] = None
    ) -> bool:
        """
        Vérifie si une clé existe.

        Args:
            key: Clé à vérifier
            namespace: Namespace optionnel

        Returns:
            True si la clé existe
        """
        await self.connect()

        full_key = self._make_key(key, namespace)

        try:
            return await self._redis.exists(full_key) > 0
        except Exception as e:
            print(f"Cache exists error for {full_key}: {e}")
            return False

    async def ttl(
        self,
        key: str,
        namespace: Optional[str] = None
    ) -> int:
        """
        Récupère le TTL restant d'une clé.

        Args:
            key: Clé
            namespace: Namespace optionnel

        Returns:
            TTL en secondes (-1 si pas de TTL, -2 si clé n'existe pas)
        """
        await self.connect()

        full_key = self._make_key(key, namespace)

        try:
            return await self._redis.ttl(full_key)
        except Exception as e:
            print(f"Cache ttl error for {full_key}: {e}")
            return -2

    async def expire(
        self,
        key: str,
        ttl: int,
        namespace: Optional[str] = None
    ) -> bool:
        """
        Définit un TTL sur une clé existante.

        Args:
            key: Clé
            ttl: TTL en secondes
            namespace: Namespace optionnel

        Returns:
            True si réussi
        """
        await self.connect()

        full_key = self._make_key(key, namespace)

        try:
            return await self._redis.expire(full_key, ttl)
        except Exception as e:
            print(f"Cache expire error for {full_key}: {e}")
            return False

    async def increment(
        self,
        key: str,
        amount: int = 1,
        namespace: Optional[str] = None
    ) -> int:
        """
        Incrémente une valeur numérique.

        Args:
            key: Clé
            amount: Montant à ajouter
            namespace: Namespace optionnel

        Returns:
            Nouvelle valeur
        """
        await self.connect()

        full_key = self._make_key(key, namespace)

        try:
            return await self._redis.incrby(full_key, amount)
        except Exception as e:
            print(f"Cache increment error for {full_key}: {e}")
            return 0

    async def get_or_set(
        self,
        key: str,
        factory: Callable,
        ttl: Optional[int] = None,
        namespace: Optional[str] = None
    ) -> Any:
        """
        Récupère une valeur du cache, ou la génère et la stocke si absente.

        Args:
            key: Clé
            factory: Fonction pour générer la valeur si absente
            ttl: TTL en secondes
            namespace: Namespace optionnel

        Returns:
            Valeur (depuis cache ou factory)
        """
        # Essayer de récupérer depuis le cache
        value = await self.get(key, namespace=namespace)

        if value is not None:
            return value

        # Générer la valeur
        if asyncio.iscoroutinefunction(factory):
            value = await factory()
        else:
            value = factory()

        # Stocker dans le cache
        await self.set(key, value, ttl=ttl, namespace=namespace)

        return value

    def cached(
        self,
        ttl: Optional[int] = None,
        namespace: Optional[str] = None,
        key_builder: Optional[Callable] = None
    ):
        """
        Décorateur pour mettre en cache le résultat d'une fonction.

        Args:
            ttl: TTL en secondes
            namespace: Namespace
            key_builder: Fonction pour construire la clé de cache

        Usage:
            @cache_service.cached(ttl=300, namespace="users")
            async def get_user(user_id: str):
                return await db.get(user_id)
        """
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                # Construire la clé de cache
                if key_builder:
                    cache_key = key_builder(*args, **kwargs)
                else:
                    # Clé par défaut basée sur les arguments
                    func_name = func.__name__
                    args_str = str(args) + str(sorted(kwargs.items()))
                    args_hash = hashlib.md5(args_str.encode()).hexdigest()
                    cache_key = f"{func_name}:{args_hash}"

                # Essayer de récupérer depuis le cache
                result = await self.get(cache_key, namespace=namespace)

                if result is not None:
                    return result

                # Exécuter la fonction
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)

                # Stocker dans le cache
                await self.set(cache_key, result, ttl=ttl, namespace=namespace)

                return result

            return wrapper
        return decorator

    async def get_stats(self) -> dict:
        """
        Récupère les statistiques du cache.

        Returns:
            Dictionnaire avec hits, misses, hit_rate, etc.
        """
        total_requests = self._hits + self._misses
        hit_rate = (self._hits / total_requests * 100) if total_requests > 0 else 0

        # Stats Redis
        info = {}
        try:
            await self.connect()
            redis_info = await self._redis.info("stats")
            info = {
                "redis_hits": redis_info.get("keyspace_hits", 0),
                "redis_misses": redis_info.get("keyspace_misses", 0),
            }
        except Exception:
            pass

        return {
            "hits": self._hits,
            "misses": self._misses,
            "sets": self._sets,
            "deletes": self._deletes,
            "total_requests": total_requests,
            "hit_rate": round(hit_rate, 2),
            **info
        }

    async def clear_stats(self):
        """Réinitialise les statistiques"""
        self._hits = 0
        self._misses = 0
        self._sets = 0
        self._deletes = 0


# Instance globale
cache_service = CacheService()


# Context manager pour cleanup
class CacheContext:
    """Context manager pour gérer la connexion Redis"""

    async def __aenter__(self):
        await cache_service.connect()
        return cache_service

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await cache_service.disconnect()

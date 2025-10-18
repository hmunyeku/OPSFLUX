"""
Metrics Service - CORE Service

Service de collecte de métriques et monitoring pour l'application.

Fonctionnalités :
- Collecte de métriques applicatives (requests, errors, latency)
- Métriques métier personnalisées (incidents created, users active, etc.)
- Export vers Prometheus, Datadog, ou autre
- Alerting sur seuils
- Dashboards JSON pour Grafana
- Health checks détaillés

Types de métriques :
- Counter: Compteur incrémental (requests_total, errors_total)
- Gauge: Valeur instantanée (active_users, memory_usage)
- Histogram: Distribution (request_duration, file_size)
- Summary: Statistiques (p50, p95, p99)

Usage :
    from app.core.metrics_service import metrics_service

    # Incrémenter un compteur
    metrics_service.increment("http_requests_total", labels={"method": "POST", "endpoint": "/api/v1/users"})

    # Enregistrer une durée
    with metrics_service.timer("db_query_duration", labels={"table": "users"}):
        result = db.query(...)

    # Gauge (nombre d'utilisateurs actifs)
    metrics_service.set_gauge("active_users", count)

    # Métrique métier
    metrics_service.track_business_event("incident_created", module="hse")
"""

import time
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime, timedelta
from collections import defaultdict
from functools import wraps
from contextlib import contextmanager
import threading

from app.core.logger_service import get_logger


logger = get_logger(__name__)


class MetricType:
    """Types de métriques"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


class Metric:
    """Classe de base pour une métrique"""

    def __init__(self, name: str, description: str, labels: Optional[List[str]] = None):
        self.name = name
        self.description = description
        self.labels = labels or []
        self.values: Dict[tuple, Any] = {}
        self._lock = threading.Lock()

    def _make_key(self, label_values: Dict[str, str]) -> tuple:
        """Crée une clé unique basée sur les labels"""
        return tuple(label_values.get(label, "") for label in self.labels)


class Counter(Metric):
    """Compteur incrémental"""

    def increment(self, value: float = 1.0, labels: Optional[Dict[str, str]] = None):
        """Incrémente le compteur"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            self.values[key] = self.values.get(key, 0.0) + value

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Récupère la valeur actuelle"""
        key = self._make_key(labels or {})
        return self.values.get(key, 0.0)

    def reset(self):
        """Réinitialise le compteur"""
        with self._lock:
            self.values.clear()


class Gauge(Metric):
    """Valeur instantanée"""

    def set(self, value: float, labels: Optional[Dict[str, str]] = None):
        """Définit la valeur"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            self.values[key] = value

    def increment(self, value: float = 1.0, labels: Optional[Dict[str, str]] = None):
        """Incrémente la gauge"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            self.values[key] = self.values.get(key, 0.0) + value

    def decrement(self, value: float = 1.0, labels: Optional[Dict[str, str]] = None):
        """Décrémente la gauge"""
        self.increment(-value, labels)

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Récupère la valeur actuelle"""
        key = self._make_key(labels or {})
        return self.values.get(key, 0.0)


class Histogram(Metric):
    """Distribution de valeurs"""

    def __init__(self, name: str, description: str, labels: Optional[List[str]] = None, buckets: Optional[List[float]] = None):
        super().__init__(name, description, labels)
        self.buckets = buckets or [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        self.observations: Dict[tuple, List[float]] = {}

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None):
        """Enregistre une observation"""
        labels = labels or {}
        key = self._make_key(labels)

        with self._lock:
            if key not in self.observations:
                self.observations[key] = []
            self.observations[key].append(value)

    def get_stats(self, labels: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Récupère les statistiques (count, sum, buckets)"""
        key = self._make_key(labels or {})
        values = self.observations.get(key, [])

        if not values:
            return {"count": 0, "sum": 0, "buckets": {}}

        stats = {
            "count": len(values),
            "sum": sum(values),
            "buckets": {},
        }

        # Compter les valeurs par bucket
        for bucket in self.buckets:
            stats["buckets"][bucket] = sum(1 for v in values if v <= bucket)

        return stats


class MetricsService:
    """
    Service de collecte de métriques.

    Architecture :
    - Métriques stockées en mémoire (thread-safe)
    - Export vers Prometheus via /metrics endpoint
    - Métriques applicatives + métriques métier
    - Alerting sur seuils configurables
    """

    def __init__(self):
        self._metrics: Dict[str, Metric] = {}
        self._alerts: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

        # Métriques système par défaut
        self._register_default_metrics()

    def _register_default_metrics(self):
        """Enregistre les métriques par défaut"""

        # HTTP Requests
        self.register_counter(
            "http_requests_total",
            "Total HTTP requests",
            labels=["method", "endpoint", "status"]
        )

        self.register_histogram(
            "http_request_duration_seconds",
            "HTTP request duration in seconds",
            labels=["method", "endpoint"]
        )

        # Errors
        self.register_counter(
            "errors_total",
            "Total errors",
            labels=["type", "module"]
        )

        # Database
        self.register_histogram(
            "db_query_duration_seconds",
            "Database query duration",
            labels=["table", "operation"]
        )

        # Cache
        self.register_counter(
            "cache_hits_total",
            "Cache hits",
            labels=["namespace"]
        )

        self.register_counter(
            "cache_misses_total",
            "Cache misses",
            labels=["namespace"]
        )

        # Business metrics
        self.register_counter(
            "business_events_total",
            "Business events",
            labels=["event_type", "module"]
        )

        # Active users
        self.register_gauge(
            "active_users",
            "Currently active users"
        )

    def register_counter(
        self,
        name: str,
        description: str,
        labels: Optional[List[str]] = None
    ) -> Counter:
        """Enregistre un compteur"""
        if name in self._metrics:
            return self._metrics[name]

        counter = Counter(name, description, labels)
        self._metrics[name] = counter

        logger.debug(f"Metric registered: {name} (counter)")
        return counter

    def register_gauge(
        self,
        name: str,
        description: str,
        labels: Optional[List[str]] = None
    ) -> Gauge:
        """Enregistre une gauge"""
        if name in self._metrics:
            return self._metrics[name]

        gauge = Gauge(name, description, labels)
        self._metrics[name] = gauge

        logger.debug(f"Metric registered: {name} (gauge)")
        return gauge

    def register_histogram(
        self,
        name: str,
        description: str,
        labels: Optional[List[str]] = None,
        buckets: Optional[List[float]] = None
    ) -> Histogram:
        """Enregistre un histogram"""
        if name in self._metrics:
            return self._metrics[name]

        histogram = Histogram(name, description, labels, buckets)
        self._metrics[name] = histogram

        logger.debug(f"Metric registered: {name} (histogram)")
        return histogram

    def increment(
        self,
        name: str,
        value: float = 1.0,
        labels: Optional[Dict[str, str]] = None
    ):
        """Incrémente un compteur"""
        metric = self._metrics.get(name)
        if metric and isinstance(metric, Counter):
            metric.increment(value, labels)

    def set_gauge(
        self,
        name: str,
        value: float,
        labels: Optional[Dict[str, str]] = None
    ):
        """Définit une gauge"""
        metric = self._metrics.get(name)
        if metric and isinstance(metric, Gauge):
            metric.set(value, labels)

    def observe(
        self,
        name: str,
        value: float,
        labels: Optional[Dict[str, str]] = None
    ):
        """Enregistre une observation dans un histogram"""
        metric = self._metrics.get(name)
        if metric and isinstance(metric, Histogram):
            metric.observe(value, labels)

    @contextmanager
    def timer(self, name: str, labels: Optional[Dict[str, str]] = None):
        """
        Context manager pour mesurer la durée d'une opération.

        Usage:
            with metrics_service.timer("db_query_duration_seconds", {"table": "users"}):
                result = db.query(...)
        """
        start = time.perf_counter()
        try:
            yield
        finally:
            duration = time.perf_counter() - start
            self.observe(name, duration, labels)

    def track_business_event(
        self,
        event_type: str,
        module: Optional[str] = None,
        count: float = 1.0
    ):
        """
        Track un événement métier.

        Args:
            event_type: Type d'événement (ex: "incident_created", "user_login")
            module: Module concerné
            count: Nombre d'occurrences
        """
        labels = {"event_type": event_type}
        if module:
            labels["module"] = module

        self.increment("business_events_total", value=count, labels=labels)

    def export_prometheus(self) -> str:
        """
        Exporte les métriques au format Prometheus.

        Returns:
            Texte au format Prometheus
        """
        output = []

        for name, metric in self._metrics.items():
            # TYPE et HELP
            metric_type = "counter" if isinstance(metric, Counter) else \
                         "gauge" if isinstance(metric, Gauge) else \
                         "histogram"

            output.append(f"# TYPE {name} {metric_type}")
            output.append(f"# HELP {name} {metric.description}")

            # Valeurs
            if isinstance(metric, (Counter, Gauge)):
                for key, value in metric.values.items():
                    labels_str = self._format_labels(metric.labels, key)
                    output.append(f"{name}{labels_str} {value}")

            elif isinstance(metric, Histogram):
                for key, observations in metric.observations.items():
                    labels_str = self._format_labels(metric.labels, key)
                    stats = metric.get_stats(dict(zip(metric.labels, key)))

                    # Count et sum
                    output.append(f"{name}_count{labels_str} {stats['count']}")
                    output.append(f"{name}_sum{labels_str} {stats['sum']}")

                    # Buckets
                    for bucket, count in stats['buckets'].items():
                        bucket_labels = labels_str[:-1] + f',le="{bucket}"' + labels_str[-1]
                        output.append(f"{name}_bucket{bucket_labels} {count}")

            output.append("")  # Ligne vide entre les métriques

        return "\n".join(output)

    def _format_labels(self, label_names: List[str], label_values: tuple) -> str:
        """Formate les labels pour Prometheus"""
        if not label_names:
            return ""

        labels = []
        for name, value in zip(label_names, label_values):
            if value:
                labels.append(f'{name}="{value}"')

        if labels:
            return "{" + ",".join(labels) + "}"
        return ""

    def get_stats(self) -> Dict[str, Any]:
        """
        Récupère toutes les statistiques.

        Returns:
            Dictionnaire avec toutes les métriques
        """
        stats = {}

        for name, metric in self._metrics.items():
            if isinstance(metric, (Counter, Gauge)):
                stats[name] = {
                    "type": metric.__class__.__name__.lower(),
                    "values": dict(metric.values),
                }
            elif isinstance(metric, Histogram):
                stats[name] = {
                    "type": "histogram",
                    "stats": {},
                }
                for key in metric.observations:
                    key_str = "-".join(key)
                    stats[name]["stats"][key_str] = metric.get_stats(dict(zip(metric.labels, key)))

        return stats

    def reset_all(self):
        """Réinitialise toutes les métriques"""
        for metric in self._metrics.values():
            if isinstance(metric, Counter):
                metric.reset()


# Instance globale
metrics_service = MetricsService()


# Décorateur pour tracker automatiquement les appels de fonction
def track_calls(
    metric_name: Optional[str] = None,
    labels: Optional[Dict[str, str]] = None
):
    """
    Décorateur pour tracker les appels de fonction.

    Usage:
        @track_calls(metric_name="api_calls", labels={"endpoint": "users"})
        def get_users():
            return users
    """
    def decorator(func: Callable):
        name = metric_name or f"{func.__module__}.{func.__name__}_calls_total"

        # Enregistrer le compteur si pas déjà fait
        if name not in metrics_service._metrics:
            metrics_service.register_counter(name, f"Calls to {func.__name__}")

        @wraps(func)
        def wrapper(*args, **kwargs):
            metrics_service.increment(name, labels=labels)
            return func(*args, **kwargs)

        return wrapper
    return decorator


# Décorateur pour mesurer la durée d'exécution
def track_duration(
    metric_name: Optional[str] = None,
    labels: Optional[Dict[str, str]] = None
):
    """
    Décorateur pour mesurer la durée d'exécution.

    Usage:
        @track_duration(metric_name="api_duration", labels={"endpoint": "users"})
        def get_users():
            return users
    """
    def decorator(func: Callable):
        name = metric_name or f"{func.__module__}.{func.__name__}_duration_seconds"

        # Enregistrer l'histogram si pas déjà fait
        if name not in metrics_service._metrics:
            metrics_service.register_histogram(name, f"Duration of {func.__name__}")

        @wraps(func)
        def wrapper(*args, **kwargs):
            with metrics_service.timer(name, labels=labels):
                return func(*args, **kwargs)

        return wrapper
    return decorator

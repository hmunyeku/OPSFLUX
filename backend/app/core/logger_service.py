"""
Logger Service - CORE Service

Service de logging centralisé et structuré pour l'application.

Fonctionnalités :
- Logging structuré (JSON) pour faciliter l'analyse
- Niveaux de log configurables par module
- Rotation automatique des fichiers de log
- Intégration avec des services externes (Sentry, Datadog, etc.)
- Contexte enrichi (user, request_id, module, etc.)
- Performance tracking

Usage :
    from app.core.logger_service import get_logger

    logger = get_logger(__name__)
    logger.info("User logged in", extra={"user_id": user.id})
    logger.error("Database error", exc_info=True)

    # Avec contexte
    with logger.context(module="hse", user_id="123"):
        logger.info("Creating incident report")
"""

import logging
import logging.handlers
import sys
import json
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime
from contextvars import ContextVar

from app.core.config import settings


# Variables de contexte pour enrichir les logs
log_context: ContextVar[Dict[str, Any]] = ContextVar('log_context', default={})


class JSONFormatter(logging.Formatter):
    """
    Formateur JSON pour les logs structurés.

    Produit des logs au format JSON pour faciliter :
    - Le parsing par des outils d'analyse (ELK, Datadog, etc.)
    - La recherche et le filtrage
    - L'agrégation et les statistiques
    """

    def format(self, record: logging.LogRecord) -> str:
        """Formate un record de log en JSON"""

        # Données de base
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Ajouter le contexte global
        context = log_context.get()
        if context:
            log_data["context"] = context

        # Ajouter les données extra
        if hasattr(record, "extra_data"):
            log_data["extra"] = record.extra_data

        # Ajouter l'exception si présente
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": self.formatException(record.exc_info)
            }

        # Ajouter l'environnement
        log_data["environment"] = settings.ENVIRONMENT

        return json.dumps(log_data, default=str, ensure_ascii=False)


class ColoredFormatter(logging.Formatter):
    """
    Formateur avec couleurs pour la console (development).

    Rend les logs plus lisibles en développement avec des codes ANSI.
    """

    # Codes couleurs ANSI
    COLORS = {
        'DEBUG': '\033[36m',      # Cyan
        'INFO': '\033[32m',       # Vert
        'WARNING': '\033[33m',    # Jaune
        'ERROR': '\033[31m',      # Rouge
        'CRITICAL': '\033[35m',   # Magenta
        'RESET': '\033[0m',       # Reset
    }

    def format(self, record: logging.LogRecord) -> str:
        """Formate un record avec couleurs"""
        color = self.COLORS.get(record.levelname, self.COLORS['RESET'])
        reset = self.COLORS['RESET']

        # Format: [LEVEL] timestamp - logger - message
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        formatted = (
            f"{color}[{record.levelname:8}]{reset} "
            f"{timestamp} - "
            f"{record.name} - "
            f"{record.getMessage()}"
        )

        # Ajouter le contexte si présent
        context = log_context.get()
        if context:
            formatted += f" {color}[{context}]{reset}"

        # Ajouter l'exception si présente
        if record.exc_info:
            formatted += f"\n{self.formatException(record.exc_info)}"

        return formatted


class LoggerService:
    """
    Service de gestion centralisée des loggers.

    Responsabilités :
    - Configuration des loggers par module
    - Gestion des handlers (console, fichier, externe)
    - Rotation des fichiers de log
    - Niveaux de log par environnement
    """

    def __init__(self):
        self._loggers: Dict[str, logging.Logger] = {}
        self._configured = False
        self._log_dir = Path("logs")

    def configure(self):
        """Configure le système de logging"""
        if self._configured:
            return

        # Créer le dossier de logs
        self._log_dir.mkdir(exist_ok=True)

        # Niveau de log par défaut selon l'environnement
        if settings.ENVIRONMENT == "production":
            default_level = logging.INFO
            use_json = True
        elif settings.ENVIRONMENT == "staging":
            default_level = logging.INFO
            use_json = True
        else:  # local
            default_level = logging.DEBUG
            use_json = False

        # Configurer le logger racine
        root_logger = logging.getLogger()
        root_logger.setLevel(default_level)

        # Nettoyer les handlers existants
        root_logger.handlers.clear()

        # Handler console
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(default_level)

        if use_json:
            console_handler.setFormatter(JSONFormatter())
        else:
            console_handler.setFormatter(ColoredFormatter())

        root_logger.addHandler(console_handler)

        # Handler fichier avec rotation (production/staging uniquement)
        if settings.ENVIRONMENT in ["production", "staging"]:
            # Fichier général
            file_handler = logging.handlers.RotatingFileHandler(
                filename=self._log_dir / "app.log",
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=10,
                encoding="utf-8"
            )
            file_handler.setLevel(default_level)
            file_handler.setFormatter(JSONFormatter())
            root_logger.addHandler(file_handler)

            # Fichier d'erreurs séparé
            error_handler = logging.handlers.RotatingFileHandler(
                filename=self._log_dir / "errors.log",
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=10,
                encoding="utf-8"
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(JSONFormatter())
            root_logger.addHandler(error_handler)

        # Désactiver les logs trop verbeux de certaines librairies
        logging.getLogger("urllib3").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("asyncio").setLevel(logging.WARNING)

        self._configured = True

    def get_logger(
        self,
        name: str,
        level: Optional[int] = None
    ) -> logging.Logger:
        """
        Récupère ou crée un logger avec le nom spécifié.

        Args:
            name: Nom du logger (généralement __name__)
            level: Niveau de log optionnel

        Returns:
            Logger configuré
        """
        if not self._configured:
            self.configure()

        if name in self._loggers:
            return self._loggers[name]

        logger = logging.getLogger(name)

        if level:
            logger.setLevel(level)

        self._loggers[name] = logger
        return logger

    def set_level(self, name: str, level: int):
        """
        Définit le niveau de log pour un logger spécifique.

        Args:
            name: Nom du logger
            level: Niveau (logging.DEBUG, INFO, WARNING, ERROR, CRITICAL)
        """
        logger = self.get_logger(name)
        logger.setLevel(level)

    def set_module_level(self, module_code: str, level: int):
        """
        Définit le niveau de log pour tous les loggers d'un module.

        Args:
            module_code: Code du module (ex: "hse")
            level: Niveau de log
        """
        pattern = f"modules.{module_code}"
        for logger_name in self._loggers:
            if logger_name.startswith(pattern):
                self.set_level(logger_name, level)


# Instance globale
logger_service = LoggerService()


def get_logger(name: str, level: Optional[int] = None) -> logging.Logger:
    """
    Fonction helper pour obtenir un logger.

    Usage:
        logger = get_logger(__name__)
        logger.info("Message")

    Args:
        name: Nom du logger (utiliser __name__)
        level: Niveau optionnel

    Returns:
        Logger configuré
    """
    return logger_service.get_logger(name, level)


class LogContext:
    """
    Context manager pour enrichir les logs avec du contexte.

    Usage:
        with LogContext(user_id="123", module="hse"):
            logger.info("Action performed")
            # Les logs incluront automatiquement user_id et module
    """

    def __init__(self, **kwargs):
        self.context = kwargs
        self.token = None

    def __enter__(self):
        # Récupérer le contexte existant et le fusionner
        current = log_context.get().copy()
        current.update(self.context)
        self.token = log_context.set(current)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.token:
            log_context.reset(self.token)


class PerformanceLogger:
    """
    Logger de performance pour mesurer le temps d'exécution.

    Usage:
        with PerformanceLogger("database_query", logger=logger):
            result = db.query(...)
            # Log automatique du temps d'exécution
    """

    def __init__(
        self,
        operation: str,
        logger: Optional[logging.Logger] = None,
        threshold_ms: Optional[float] = None
    ):
        self.operation = operation
        self.logger = logger or get_logger(__name__)
        self.threshold_ms = threshold_ms
        self.start_time = None
        self.end_time = None

    def __enter__(self):
        from time import perf_counter
        self.start_time = perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        from time import perf_counter
        self.end_time = perf_counter()
        duration_ms = (self.end_time - self.start_time) * 1000

        # Logger uniquement si au-dessus du seuil
        if self.threshold_ms is None or duration_ms >= self.threshold_ms:
            level = logging.WARNING if duration_ms >= 1000 else logging.DEBUG

            self.logger.log(
                level,
                f"Performance: {self.operation}",
                extra={
                    "extra_data": {
                        "operation": self.operation,
                        "duration_ms": round(duration_ms, 2),
                        "slow": duration_ms >= 1000
                    }
                }
            )


# Fonction helper pour logger des événements métier
def log_business_event(
    event_type: str,
    description: str,
    user_id: Optional[str] = None,
    module: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    logger: Optional[logging.Logger] = None
):
    """
    Logger un événement métier avec structure standardisée.

    Args:
        event_type: Type d'événement (ex: "user.login", "incident.created")
        description: Description lisible
        user_id: ID de l'utilisateur
        module: Module concerné
        entity_type: Type d'entité (ex: "incident", "user")
        entity_id: ID de l'entité
        metadata: Données supplémentaires
        logger: Logger à utiliser (défaut: logger racine)
    """
    if logger is None:
        logger = get_logger("business_events")

    event_data = {
        "event_type": event_type,
        "description": description,
    }

    if user_id:
        event_data["user_id"] = user_id
    if module:
        event_data["module"] = module
    if entity_type:
        event_data["entity_type"] = entity_type
    if entity_id:
        event_data["entity_id"] = entity_id
    if metadata:
        event_data["metadata"] = metadata

    logger.info(
        f"Business event: {event_type}",
        extra={"extra_data": event_data}
    )

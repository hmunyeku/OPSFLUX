"""Application settings via pydantic-settings (.env)."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str = "CHANGEME"
    API_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"
    ALLOWED_HOSTS: str = "*"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    LOG_LEVEL: str = "INFO"

    # ── PostgreSQL ───────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://opsflux:opsflux_dev@localhost:5432/opsflux"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 30

    # ── Redis ────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── JWT ──────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "CHANGEME"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── SSO ──────────────────────────────────────────────────────
    OAUTH2_ISSUER_URL: str = ""
    OAUTH2_CLIENT_ID: str = "opsflux"
    OAUTH2_CLIENT_SECRET: str = ""
    OAUTH2_AUDIENCE: str = "opsflux-api"

    # ── Storage ──────────────────────────────────────────────────
    STORAGE_BACKEND: Literal["local", "minio", "s3"] = "local"
    S3_ENDPOINT: str = "http://minio:9000"
    S3_BUCKET: str = "opsflux-documents"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "us-east-1"
    STORAGE_MAX_FILE_SIZE_MB: int = 50

    # ── Email ────────────────────────────────────────────────────
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_ADDRESS: str = "noreply@opsflux.io"
    SMTP_FROM_NAME: str = "OpsFlux"
    SMTP_USE_TLS: bool = False

    # ── AI / MCP ─────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3"

    # ── Monitoring ───────────────────────────────────────────────
    SENTRY_DSN: str = ""
    PROMETHEUS_ENABLED: bool = False

    # ── Domains ──────────────────────────────────────────────────
    APP_URL: str = "http://localhost:5173"
    API_URL: str = "http://localhost:8000"
    WEB_URL: str = "http://localhost:5174"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_prod(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

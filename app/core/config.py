"""Application settings via pydantic-settings (.env)."""

from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlparse

from pydantic import model_validator
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
    CORS_ALLOWED_METHODS: str = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    CORS_ALLOWED_HEADERS: str = "Authorization,Content-Type,X-Entity-ID,X-Tenant,X-Request-Id,Accept,Accept-Language"
    LOG_LEVEL: str = "INFO"
    DEV_SEED_ON_STARTUP: bool = False

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

    # ── Auth Security (AUTH.md §7-8) ──────────────────────────
    AUTH_PASSWORD_MIN_LENGTH: int = 12
    AUTH_PASSWORD_REQUIRE_SPECIAL: bool = True
    AUTH_PASSWORD_REQUIRE_UPPERCASE: bool = True
    AUTH_PASSWORD_REQUIRE_DIGIT: bool = True
    AUTH_MAX_FAILED_ATTEMPTS: int = 5
    AUTH_LOCKOUT_DURATION_MIN: int = 15

    # Login bot protection
    AUTH_LOGIN_RATE_LIMIT_PER_IP: int = 10  # max login attempts per IP per minute
    AUTH_LOGIN_RATE_LIMIT_PER_EMAIL: int = 5  # max login attempts per email per minute
    AUTH_CAPTCHA_ENABLED: bool = False  # enable CAPTCHA verification
    AUTH_CAPTCHA_PROVIDER: str = "turnstile"  # turnstile | hcaptcha | recaptcha
    AUTH_CAPTCHA_SECRET_KEY: str = ""  # server-side secret key
    AUTH_CAPTCHA_SITE_KEY: str = ""  # client-side site key (returned in /config endpoint)

    # Login security tracking
    AUTH_GEO_BLOCKING_ENABLED: bool = False
    AUTH_ALLOWED_COUNTRIES: str = ""  # comma-separated ISO codes, empty = all allowed
    AUTH_SUSPICIOUS_LOGIN_NOTIFY: bool = True

    # ── LDAP / Active Directory ──
    LDAP_SERVER_URL: str = ""
    LDAP_BIND_DN: str = ""
    LDAP_BIND_PASSWORD: str = ""
    LDAP_BASE_DN: str = ""
    LDAP_USER_SEARCH_FILTER: str = "(objectClass=person)"
    LDAP_GROUP_SEARCH_FILTER: str = "(objectClass=group)"

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

    @model_validator(mode="after")
    def _check_production_secrets(self) -> Self:
        """Refuse to start in production with default secret keys."""
        if self.ENVIRONMENT == "production":
            insecure = []
            if self.SECRET_KEY == "CHANGEME":
                insecure.append("SECRET_KEY")
            if self.JWT_SECRET_KEY == "CHANGEME":
                insecure.append("JWT_SECRET_KEY")
            if insecure:
                raise ValueError(
                    f"CRITICAL: {', '.join(insecure)} must be changed from default "
                    f"value in production. Set secure random values in .env."
                )
        return self

    @property
    def allowed_origins_list(self) -> list[str]:
        origins: list[str] = []

        def _add(origin: str | None) -> None:
            if not origin:
                return
            normalized = origin.strip().rstrip("/")
            if normalized and normalized not in origins:
                origins.append(normalized)

        for raw_origin in self.ALLOWED_ORIGINS.split(","):
            _add(raw_origin)

        def _add_related(url_value: str | None) -> None:
            if not url_value:
                return
            parsed = urlparse(url_value)
            scheme = parsed.scheme or "https"
            hostname = parsed.hostname
            if not hostname:
                return
            port = f":{parsed.port}" if parsed.port else ""

            def _origin(host: str) -> str:
                return f"{scheme}://{host}{port}"

            _add(_origin(hostname))

            related_hosts = {hostname}
            for prefix in ("app.", "ext.", "api.", "web."):
                if hostname.startswith(prefix):
                    suffix = hostname[len(prefix):]
                    related_hosts.update({
                        f"app.{suffix}",
                        f"ext.{suffix}",
                        f"api.{suffix}",
                        f"web.{suffix}",
                        suffix,
                    })
                    break

            for host in sorted(related_hosts):
                _add(_origin(host))

        for url_value in (self.APP_URL, self.FRONTEND_URL, self.WEB_URL, self.API_BASE_URL, self.API_URL):
            _add_related(url_value)

        return origins

    @property
    def cors_methods_list(self) -> list[str]:
        if self.CORS_ALLOWED_METHODS == "*":
            return ["*"]
        return [m.strip() for m in self.CORS_ALLOWED_METHODS.split(",") if m.strip()]

    @property
    def cors_headers_list(self) -> list[str]:
        if self.CORS_ALLOWED_HEADERS == "*":
            return ["*"]
        return [h.strip() for h in self.CORS_ALLOWED_HEADERS.split(",") if h.strip()]

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_prod(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def external_paxlog_url(self) -> str:
        parsed = urlparse(self.APP_URL)
        scheme = parsed.scheme or "https"
        hostname = parsed.hostname or "localhost"
        port = f":{parsed.port}" if parsed.port else ""

        if hostname.startswith("ext."):
            target_host = hostname
        elif hostname.startswith("app."):
            target_host = f"ext.{hostname[4:]}"
        elif hostname.startswith("web."):
            target_host = f"ext.{hostname[4:]}"
        elif hostname.startswith("api."):
            target_host = f"ext.{hostname[4:]}"
        else:
            target_host = hostname

        return f"{scheme}://{target_host}{port}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

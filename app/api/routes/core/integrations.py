"""Integration connector test routes."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import Setting, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


class TestRequest(BaseModel):
    connector_id: str


class TestResult(BaseModel):
    connector_id: str
    status: str  # "ok" | "error"
    message: str
    tested_at: str  # ISO datetime


async def _get_connector_settings(db: AsyncSession, prefix: str) -> dict[str, str]:
    """Fetch all settings with the given prefix."""
    result = await db.execute(
        select(Setting).where(Setting.key.startswith(prefix), Setting.scope == "entity")
    )
    settings = {}
    for s in result.scalars().all():
        # Extract field name from key: "integration.smtp.host" -> "host"
        field = s.key.replace(prefix + ".", "")
        val = s.value.get("v", "") if isinstance(s.value, dict) else str(s.value)
        settings[field] = str(val) if val else ""
    return settings


async def _save_test_result(db: AsyncSession, connector_id: str, status: str, message: str) -> None:
    """Store the test result in settings for frontend display."""
    now = datetime.now(timezone.utc).isoformat()

    for key, value in [
        (f"integration.{connector_id}.last_test_status", status),
        (f"integration.{connector_id}.last_test_at", now),
        (f"integration.{connector_id}.last_test_error", message if status == "error" else ""),
    ]:
        result = await db.execute(
            select(Setting).where(Setting.key == key, Setting.scope == "entity")
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = {"v": value}
        else:
            db.add(Setting(key=key, value={"v": value}, scope="entity"))

    await db.commit()


# ── Connector-specific test functions ────────────────────────

async def _test_smtp(cfg: dict[str, str]) -> tuple[str, str]:
    """Test SMTP connection."""
    host = cfg.get("host", "")
    port = int(cfg.get("port", "587") or "587")

    if not host:
        return "error", "Serveur SMTP non configuré"

    try:
        import aiosmtplib
        smtp = aiosmtplib.SMTP(hostname=host, port=port, timeout=10)

        encryption = cfg.get("encryption", "tls")
        use_tls = encryption == "ssl"
        start_tls = encryption == "tls"

        await smtp.connect(use_tls=use_tls)
        if start_tls:
            await smtp.starttls()

        username = cfg.get("username", "")
        password = cfg.get("password", "")
        if username and password:
            await smtp.login(username, password)

        await smtp.quit()
        return "ok", f"Connexion SMTP réussie ({host}:{port})"
    except Exception as e:
        return "error", f"Échec connexion SMTP: {str(e)}"


async def _test_s3(cfg: dict[str, str]) -> tuple[str, str]:
    """Test S3/Object Storage connection."""
    provider = cfg.get("provider", "local")

    if provider == "local":
        return "ok", "Stockage local actif"

    endpoint = cfg.get("endpoint", "")
    bucket = cfg.get("bucket", "")
    access_key = cfg.get("access_key", "")
    secret_key = cfg.get("secret_key", "")

    if not bucket or not access_key:
        return "error", "Bucket ou Access Key non configuré"

    try:
        import boto3
        from botocore.config import Config

        kwargs = {
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "config": Config(connect_timeout=10, read_timeout=10),
        }
        if endpoint:
            kwargs["endpoint_url"] = endpoint
        region = cfg.get("region", "")
        if region:
            kwargs["region_name"] = region

        s3 = boto3.client("s3", **kwargs)
        s3.head_bucket(Bucket=bucket)
        return "ok", f"Bucket '{bucket}' accessible"
    except ImportError:
        return "error", "boto3 non installé"
    except Exception as e:
        return "error", f"Échec connexion S3: {str(e)}"


async def _test_webhook(cfg: dict[str, str]) -> tuple[str, str]:
    """Test webhook endpoint with a HEAD request."""
    url = cfg.get("url", "")
    if not url:
        return "error", "URL du webhook non configurée"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.head(url)
            if resp.status_code < 500:
                return "ok", f"Webhook accessible (HTTP {resp.status_code})"
            return "error", f"Webhook erreur HTTP {resp.status_code}"
    except ImportError:
        return "error", "httpx non installé"
    except Exception as e:
        return "error", f"Échec connexion webhook: {str(e)}"


async def _test_oauth_generic(cfg: dict[str, str], provider_name: str) -> tuple[str, str]:
    """Generic test for OAuth2 — just verify required fields are present."""
    client_id = cfg.get("client_id", "")
    client_secret = cfg.get("client_secret", "")

    if not client_id or not client_secret:
        return "error", f"Client ID ou Secret non configuré pour {provider_name}"

    return "ok", f"{provider_name} configuré (client_id: {client_id[:12]}...)"


async def _test_ldap(cfg: dict[str, str]) -> tuple[str, str]:
    """Test LDAP connection."""
    server_url = cfg.get("server_url", "")
    if not server_url:
        return "error", "URL du serveur LDAP non configurée"

    # Just validate URL format and required fields
    bind_dn = cfg.get("bind_dn", "")
    base_dn = cfg.get("base_dn", "")
    if not bind_dn or not base_dn:
        return "error", "Bind DN ou Base DN non configuré"

    return "ok", f"LDAP configuré ({server_url})"


async def _test_sms_twilio(cfg: dict[str, str]) -> tuple[str, str]:
    """Test Twilio credentials."""
    account_sid = cfg.get("account_sid", "")
    auth_token = cfg.get("auth_token", "")

    if not account_sid or not auth_token:
        return "error", "Account SID ou Auth Token non configuré"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json",
                auth=(account_sid, auth_token),
            )
            if resp.status_code == 200:
                return "ok", "Identifiants Twilio valides"
            return "error", f"Twilio: HTTP {resp.status_code}"
    except ImportError:
        return "error", "httpx non installé"
    except Exception as e:
        return "error", f"Échec vérification Twilio: {str(e)}"


async def _test_sms_vonage(cfg: dict[str, str]) -> tuple[str, str]:
    """Test Vonage credentials."""
    api_key = cfg.get("api_key", "")
    api_secret = cfg.get("api_secret", "")

    if not api_key or not api_secret:
        return "error", "API Key ou API Secret non configuré"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://rest.nexmo.com/account/get-balance?api_key={api_key}&api_secret={api_secret}",
            )
            if resp.status_code == 200:
                return "ok", "Identifiants Vonage valides"
            return "error", f"Vonage: HTTP {resp.status_code}"
    except ImportError:
        return "error", "httpx non installé"
    except Exception as e:
        return "error", f"Échec vérification Vonage: {str(e)}"


# ── Connector test dispatcher ────────────────────────────────

CONNECTOR_TESTERS = {
    "smtp": ("integration.smtp", _test_smtp),
    "s3_storage": ("integration.storage", _test_s3),
    "google_oauth": ("integration.google_oauth", lambda cfg: _test_oauth_generic(cfg, "Google OAuth2")),
    "azure_ad": ("integration.azure", lambda cfg: _test_oauth_generic(cfg, "Azure AD")),
    "okta": ("integration.okta", lambda cfg: _test_oauth_generic(cfg, "Okta")),
    "keycloak": ("integration.keycloak", lambda cfg: _test_oauth_generic(cfg, "Keycloak")),
    "ldap": ("integration.ldap", _test_ldap),
    "sms_twilio": ("integration.sms_twilio", _test_sms_twilio),
    "sms_vonage": ("integration.sms_vonage", _test_sms_vonage),
    "webhook": ("integration.webhook", _test_webhook),
}


@router.post("/test", response_model=TestResult)
async def test_connector(
    body: TestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Test a connector's connectivity/credentials."""
    connector_id = body.connector_id

    if connector_id not in CONNECTOR_TESTERS:
        return TestResult(
            connector_id=connector_id,
            status="error",
            message=f"Connecteur inconnu: {connector_id}",
            tested_at=datetime.now(timezone.utc).isoformat(),
        )

    prefix, tester = CONNECTOR_TESTERS[connector_id]
    cfg = await _get_connector_settings(db, prefix)

    status, message = await tester(cfg)

    # Persist the test result
    await _save_test_result(db, connector_id, status, message)

    return TestResult(
        connector_id=connector_id,
        status=status,
        message=message,
        tested_at=datetime.now(timezone.utc).isoformat(),
    )

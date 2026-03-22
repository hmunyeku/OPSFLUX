"""Integration connector test routes."""

import logging
from datetime import datetime, timezone
from typing import Any

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


async def _test_sms_ovh(cfg: dict[str, str]) -> tuple[str, str]:
    """Test OVH SMS credentials by fetching account credits."""
    import hashlib
    import time as _time

    app_key = cfg.get("application_key", "")
    app_secret = cfg.get("application_secret", "")
    consumer_key = cfg.get("consumer_key", "")
    service_name = cfg.get("service_name", "")

    if not app_key or not consumer_key:
        return "error", "Application Key ou Consumer Key non configuré"
    if not service_name:
        return "error", "Nom du service SMS non configuré"

    try:
        import httpx

        url = f"https://eu.api.ovh.com/1.0/sms/{service_name}"
        timestamp = str(int(_time.time()))
        to_sign = f"{app_secret}+{consumer_key}+GET+{url}++{timestamp}"
        signature = "$1$" + hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={
                "X-Ovh-Application": app_key,
                "X-Ovh-Consumer": consumer_key,
                "X-Ovh-Timestamp": timestamp,
                "X-Ovh-Signature": signature,
            })
            if resp.status_code == 200:
                data = resp.json()
                credits_left = data.get("creditsLeft", "?")
                return "ok", f"OVH SMS connecté — {credits_left} crédits restants"
            return "error", f"OVH SMS: HTTP {resp.status_code} — {resp.text[:200]}"
    except ImportError:
        return "error", "httpx non installé"
    except Exception as e:
        return "error", f"Échec vérification OVH SMS: {str(e)[:300]}"


async def _test_ai(cfg: dict[str, str]) -> tuple[str, str]:
    """Test AI provider connection (Claude, OpenAI, Ollama, etc.)."""
    provider = cfg.get("provider", "anthropic")
    api_key = cfg.get("api_key", "")
    model = cfg.get("model", "")
    base_url = cfg.get("base_url", "")

    if provider in ("anthropic", "openai") and not api_key:
        return "error", "Clé API non configurée"

    if provider == "ollama" and not base_url:
        return "error", "URL Ollama non configurée"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            if provider == "anthropic":
                resp = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                if resp.status_code == 200:
                    return "ok", f"Anthropic connecté (modèle: {model or 'claude-sonnet-4-6'})"
                return "error", f"Anthropic: HTTP {resp.status_code} — {resp.text[:200]}"

            elif provider == "openai":
                url = (base_url.rstrip("/") if base_url else "https://api.openai.com/v1") + "/models"
                resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
                if resp.status_code == 200:
                    return "ok", f"OpenAI connecté (modèle: {model or 'gpt-4o'})"
                return "error", f"OpenAI: HTTP {resp.status_code} — {resp.text[:200]}"

            elif provider == "ollama":
                url = base_url.rstrip("/") + "/api/tags"
                resp = await client.get(url)
                if resp.status_code == 200:
                    models = resp.json().get("models", [])
                    names = [m.get("name", "") for m in models[:5]]
                    return "ok", f"Ollama connecté — {len(models)} modèle(s): {', '.join(names)}"
                return "error", f"Ollama: HTTP {resp.status_code}"

            elif provider == "mistral":
                resp = await client.get(
                    "https://api.mistral.ai/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if resp.status_code == 200:
                    return "ok", f"Mistral connecté (modèle: {model or 'mistral-large-latest'})"
                return "error", f"Mistral: HTTP {resp.status_code} — {resp.text[:200]}"

            else:
                return "error", f"Fournisseur IA inconnu: {provider}"

    except ImportError:
        return "error", "httpx non installé"
    except httpx.ConnectError:
        target = base_url or f"{provider} API"
        return "error", f"Impossible de se connecter à {target}"
    except Exception as e:
        return "error", f"Échec connexion IA: {str(e)[:300]}"


async def _test_gouti(settings: dict[str, Any]) -> tuple[str, str]:
    """Test Gouti project management API connection (OAuth2 code → token flow)."""
    base_url = settings.get("base_url", "https://apiprd.gouti.net/v1/client")
    client_id = settings.get("client_id", "")
    client_secret = settings.get("client_secret", "")
    entity_code = settings.get("entity_code", "")

    if not client_id or not client_secret:
        return "error", "Client ID ou Secret client non configuré pour Gouti"
    if not entity_code:
        return "error", "Code entité non configuré pour Gouti"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: Request authorization code
            code_resp = await client.post(
                f"{base_url.rstrip('/')}/code",
                json={
                    "callback_url": f"{base_url.rstrip('/')}/callback",
                    "client_id": client_id,
                },
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            code_resp.raise_for_status()
            code_data = code_resp.json()
            auth_code = code_data.get("code") or code_data.get("authorization_code")
            if not auth_code:
                return "error", "Aucun code d'autorisation retourné par l'API Gouti"

            # Step 2: Exchange code for token
            token_resp = await client.post(
                f"{base_url.rstrip('/')}/token",
                json={
                    "code": auth_code,
                    "client_id": client_id,
                    "secret_client": client_secret,
                },
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            token_resp.raise_for_status()
            token_data = token_resp.json()
            token = token_data.get("token") or token_data.get("access_token")
            if not token:
                return "error", "Aucun token retourné par l'API Gouti"

            return "ok", "Connexion réussie à l'API Gouti"
    except ImportError:
        return "error", "httpx non installé"
    except httpx.HTTPStatusError as e:
        return "error", f"Gouti: erreur HTTP {e.response.status_code} — {e.response.text[:200]}"
    except httpx.ConnectError:
        return "error", f"Impossible de se connecter à {base_url}"
    except Exception as e:
        return "error", f"Échec connexion Gouti: {str(e)[:300]}"


# ── Connector test dispatcher ────────────────────────────────

CONNECTOR_TESTERS = {
    "smtp": ("integration.smtp", _test_smtp),
    "s3_storage": ("integration.storage", _test_s3),
    "google_oauth": ("integration.google_oauth", lambda cfg: _test_oauth_generic(cfg, "Google OAuth2")),
    "azure_ad": ("integration.azure", lambda cfg: _test_oauth_generic(cfg, "Azure AD")),
    "okta": ("integration.okta", lambda cfg: _test_oauth_generic(cfg, "Okta")),
    "keycloak": ("integration.keycloak", lambda cfg: _test_oauth_generic(cfg, "Keycloak")),
    "ldap": ("integration.ldap", _test_ldap),
    "sms_ovh": ("integration.sms_ovh", _test_sms_ovh),
    "sms_twilio": ("integration.sms_twilio", _test_sms_twilio),
    "sms_vonage": ("integration.sms_vonage", _test_sms_vonage),
    "webhook": ("integration.webhook", _test_webhook),
    "gouti": ("integration.gouti", _test_gouti),
    "ai": ("integration.ai", _test_ai),
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

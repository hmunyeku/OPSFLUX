"""Integration connector test routes."""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.common import Setting, User
from uuid import UUID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


class TestRequest(BaseModel):
    connector_id: str


class TestResult(BaseModel):
    connector_id: str
    status: str  # "ok" | "error"
    message: str
    tested_at: str  # ISO datetime


async def _get_connector_settings(db: AsyncSession, entity_id: UUID, prefix: str) -> dict[str, str]:
    """Fetch all settings with the given prefix."""
    result = await db.execute(
        select(Setting).where(
            Setting.key.startswith(prefix),
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    settings = {}
    for s in result.scalars().all():
        # Extract field name from key: "integration.smtp.host" -> "host"
        field = s.key.replace(prefix + ".", "")
        val = s.value.get("v", "") if isinstance(s.value, dict) else str(s.value)
        settings[field] = str(val) if val else ""
    return settings


async def _save_test_result(
    db: AsyncSession,
    entity_id: UUID,
    connector_id: str,
    status: str,
    message: str,
) -> None:
    """Store the test result in settings for frontend display."""
    now = datetime.now(timezone.utc).isoformat()

    for key, value in [
        (f"integration.{connector_id}.last_test_status", status),
        (f"integration.{connector_id}.last_test_at", now),
        (f"integration.{connector_id}.last_test_error", message if status == "error" else ""),
    ]:
        result = await db.execute(
            select(Setting).where(
                Setting.key == key,
                Setting.scope == "entity",
                Setting.scope_id == str(entity_id),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = {"v": value}
        else:
            db.add(Setting(key=key, value={"v": value}, scope="entity", scope_id=str(entity_id)))

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


async def _test_whatsapp(cfg: dict[str, str]) -> tuple[str, str]:
    """Test WhatsApp Cloud API credentials by fetching the phone number info."""
    phone_number_id = cfg.get("phone_number_id", "")
    access_token = cfg.get("access_token", "")
    api_version = cfg.get("api_version", "v21.0")

    if not phone_number_id or not access_token:
        return "error", "Phone Number ID ou Access Token non configuré"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://graph.facebook.com/{api_version}/{phone_number_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                display_name = data.get("verified_name", data.get("display_phone_number", "OK"))
                return "ok", f"WhatsApp connecté — {display_name}"
            return "error", f"WhatsApp: HTTP {resp.status_code} — {resp.text[:200]}"
    except ImportError:
        return "error", "httpx non installé"
    except Exception as e:
        return "error", f"Échec vérification WhatsApp: {str(e)[:300]}"


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
    """Test Gouti API connection — uses token directly if available, otherwise OAuth2 flow."""
    base_url = str(settings.get("base_url", "https://apiprd.gouti.net/v1/client")).strip()
    client_id = str(settings.get("client_id", "")).strip()
    client_secret = str(settings.get("client_secret", "")).strip()
    entity_code = str(settings.get("entity_code", "")).strip()
    token = str(settings.get("token", "")).strip()

    if not client_id:
        return "error", "Code entreprise (Client ID) non configuré pour Gouti"
    if not token and not client_secret:
        return "error", "Token ou Secret client requis pour Gouti"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            # Strategy 1: Direct token — just call a lightweight endpoint
            if token:
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Client-Id": client_id,
                    "Accept": "application/json",
                }
                if entity_code:
                    headers["Entity-Code"] = entity_code
                resp = await client.get(
                    f"{base_url.rstrip('/')}/e-categories",
                    headers=headers,
                )
                if 200 <= resp.status_code < 300:
                    return "ok", "Connexion Gouti réussie (token direct)"
                if resp.status_code == 401 and client_secret:
                    pass  # Fall through to OAuth2
                else:
                    return "error", f"Gouti: HTTP {resp.status_code} — token invalide ou expiré"

            # Strategy 2: OAuth2 code → token flow
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
            new_token = token_data.get("token") or token_data.get("access_token")
            if not new_token:
                return "error", "Aucun token retourné par l'API Gouti"

            return "ok", "Connexion Gouti réussie (OAuth2)"
    except ImportError:
        return "error", "httpx non installé"
    except httpx.HTTPStatusError as e:
        return "error", f"Gouti: erreur HTTP {e.response.status_code} — {e.response.text[:200]}"
    except httpx.ConnectError:
        return "error", f"Impossible de se connecter à {base_url}"
    except Exception as e:
        return "error", f"Échec connexion Gouti: {str(e)[:300]}"


# ── Connector test dispatcher ────────────────────────────────

async def _test_riseup(cfg: dict[str, str]) -> tuple[str, str]:
    """Test Rise Up LMS API connection."""
    from app.services.connectors.riseup_connector import RiseUpConnector
    connector = RiseUpConnector(cfg)
    return await connector.test_connection()


CONNECTOR_TESTERS = {
    "smtp": ("integration.smtp", _test_smtp),
    "s3_storage": ("integration.storage", _test_s3),
    "google_oauth": ("integration.google_oauth", lambda cfg: _test_oauth_generic(cfg, "Google OAuth2")),
    "azure_ad": ("integration.azure", lambda cfg: _test_oauth_generic(cfg, "Azure AD")),
    "okta": ("integration.okta", lambda cfg: _test_oauth_generic(cfg, "Okta")),
    "keycloak": ("integration.keycloak", lambda cfg: _test_oauth_generic(cfg, "Keycloak")),
    "ldap": ("integration.ldap", _test_ldap),
    "whatsapp": ("integration.whatsapp", _test_whatsapp),
    "sms_ovh": ("integration.sms_ovh", _test_sms_ovh),
    "sms_twilio": ("integration.sms_twilio", _test_sms_twilio),
    "sms_vonage": ("integration.sms_vonage", _test_sms_vonage),
    "webhook": ("integration.webhook", _test_webhook),
    "gouti": ("integration.gouti", _test_gouti),
    "ai": ("integration.ai", _test_ai),
    "riseup": ("integration.riseup", _test_riseup),
}


@router.post("/test", response_model=TestResult)
async def test_connector(
    body: TestRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.integrations.manage"),
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
    cfg = await _get_connector_settings(db, entity_id, prefix)

    status, message = await tester(cfg)

    # Persist the test result
    await _save_test_result(db, entity_id, connector_id, status, message)

    return TestResult(
        connector_id=connector_id,
        status=status,
        message=message,
        tested_at=datetime.now(timezone.utc).isoformat(),
    )


# ── Real send test — actually sends a message ────────────────

class SendTestRequest(BaseModel):
    connector_id: str  # smtp | sms_twilio | sms_vonage | sms_ovh | whatsapp
    recipient: str     # email address, or phone number (with country code)


class SendTestResult(BaseModel):
    connector_id: str
    status: str  # "ok" | "error"
    message: str
    channel: str  # email | sms | whatsapp
    sent_at: str  # ISO datetime


@router.post("/test-send", response_model=SendTestResult)
async def test_send_real(
    body: SendTestRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.integrations.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Send a real test message (email, SMS or WhatsApp) to verify the integration works end-to-end.

    This is NOT a connectivity test — it actually delivers a message to the recipient.
    """
    connector_id = body.connector_id
    recipient = body.recipient.strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    sender_name = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.email or "Admin"

    if not recipient:
        return SendTestResult(connector_id=connector_id, status="error", message="Destinataire requis", channel="", sent_at=now_iso)

    try:
        if connector_id == "smtp":
            return await _send_test_email(db, entity_id, recipient, sender_name, now_iso)
        elif connector_id in ("sms_twilio", "sms_vonage", "sms_ovh"):
            return await _send_test_sms(db, entity_id, connector_id, recipient, sender_name, now_iso)
        elif connector_id == "whatsapp":
            return await _send_test_whatsapp(db, entity_id, recipient, sender_name, now_iso)
        else:
            return SendTestResult(connector_id=connector_id, status="error", message=f"Envoi de test non supporté pour: {connector_id}", channel="", sent_at=now_iso)
    except Exception as e:
        logger.exception(f"Test send failed for {connector_id}")
        return SendTestResult(connector_id=connector_id, status="error", message=f"Erreur: {str(e)[:300]}", channel=connector_id, sent_at=now_iso)


async def _send_test_email(
    db: AsyncSession,
    entity_id: UUID,
    recipient: str,
    sender_name: str,
    now_iso: str,
) -> SendTestResult:
    """Send a real test email via the configured SMTP."""
    from app.core.notifications import send_email

    subject = "OpsFlux — Test de configuration email"
    body_html = f"""
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="background: #1f2937; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 16px;">OpsFlux — Test Email</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: 0; padding: 20px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 12px; font-size: 14px; color: #374151;">
          Ce message est un test de configuration. Si vous le recevez, votre service d'envoi d'emails fonctionne correctement.
        </p>
        <table style="font-size: 13px; color: #6b7280; border-collapse: collapse;">
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Envoyé par</td><td>{sender_name}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Date</td><td>{now_iso[:19].replace('T', ' ')} UTC</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Destinataire</td><td>{recipient}</td></tr>
        </table>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="margin: 0; font-size: 11px; color: #9ca3af;">
          Ceci est un message automatique de test. Aucune action requise.
        </p>
      </div>
    </div>
    """

    try:
        await send_email(db, recipient, subject, body_html)
        return SendTestResult(connector_id="smtp", status="ok", message=f"Email envoyé à {recipient}", channel="email", sent_at=now_iso)
    except Exception as e:
        return SendTestResult(connector_id="smtp", status="error", message=f"Échec envoi email: {str(e)[:300]}", channel="email", sent_at=now_iso)


async def _send_test_sms(
    db: AsyncSession,
    entity_id: UUID,
    connector_id: str,
    recipient: str,
    sender_name: str,
    now_iso: str,
) -> SendTestResult:
    """Send a real test SMS via the specified provider."""
    from app.core.sms_service import _send_twilio, _send_vonage, _send_ovh

    cfg = await _get_connector_settings(db, entity_id, f"integration.{connector_id}")
    message = f"OpsFlux — Test SMS par {sender_name}. Si vous recevez ce message, la configuration fonctionne. ({now_iso[:16]})"

    try:
        if connector_id == "sms_twilio":
            ok = await _send_twilio(cfg, recipient, message)
        elif connector_id == "sms_vonage":
            ok = await _send_vonage(cfg, recipient, message)
        elif connector_id == "sms_ovh":
            ok = await _send_ovh(cfg, recipient, message)
        else:
            return SendTestResult(connector_id=connector_id, status="error", message="Provider SMS inconnu", channel="sms", sent_at=now_iso)

        if ok:
            return SendTestResult(connector_id=connector_id, status="ok", message=f"SMS envoyé à {recipient}", channel="sms", sent_at=now_iso)
        return SendTestResult(connector_id=connector_id, status="error", message=f"Échec envoi SMS à {recipient} — vérifiez les logs", channel="sms", sent_at=now_iso)
    except Exception as e:
        return SendTestResult(connector_id=connector_id, status="error", message=f"Erreur SMS: {str(e)[:300]}", channel="sms", sent_at=now_iso)


async def _send_test_whatsapp(
    db: AsyncSession,
    entity_id: UUID,
    recipient: str,
    sender_name: str,
    now_iso: str,
) -> SendTestResult:
    """Send a real test WhatsApp message via Cloud API."""
    cfg = await _get_connector_settings(db, entity_id, "integration.whatsapp")
    phone_number_id = cfg.get("phone_number_id", "")
    access_token = cfg.get("access_token", "")
    api_version = cfg.get("api_version", "v21.0")

    if not phone_number_id or not access_token:
        return SendTestResult(connector_id="whatsapp", status="error", message="WhatsApp non configuré", channel="whatsapp", sent_at=now_iso)

    # Normalize phone number
    to_number = recipient.lstrip("+").replace(" ", "").replace("-", "")
    message = f"OpsFlux — Test WhatsApp par {sender_name}. Configuration OK. ({now_iso[:16]})"

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json={
                    "messaging_product": "whatsapp",
                    "to": to_number,
                    "type": "text",
                    "text": {"body": message},
                },
            )
            if resp.status_code in (200, 201):
                return SendTestResult(connector_id="whatsapp", status="ok", message=f"WhatsApp envoyé à {recipient}", channel="whatsapp", sent_at=now_iso)
            return SendTestResult(connector_id="whatsapp", status="error", message=f"WhatsApp: HTTP {resp.status_code} — {resp.text[:200]}", channel="whatsapp", sent_at=now_iso)
    except Exception as e:
        return SendTestResult(connector_id="whatsapp", status="error", message=f"Erreur WhatsApp: {str(e)[:300]}", channel="whatsapp", sent_at=now_iso)

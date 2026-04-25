"""Messaging service — dispatches to configured providers with fallback cascade.

Channel preference (3-tier resolution):
    User preference > Admin default > Auto (WhatsApp → OVH → Twilio → Vonage)

Contact resolution for multi-phone/multi-email users:
    Verified + default/primary first, then verified, then any.

Usage:
    from app.core.sms_service import send_to_user, send_sms, send_whatsapp_otp

    # High-level: auto-resolve contact + channel for a user
    ok, channel = await send_to_user(db, user_id="...", subject="Alert", body="...")

    # Low-level: send to a specific phone number
    ok, channel = await send_sms(db, to="+33612345678", body="...", user_id="...")

    # OTP with WhatsApp template + SMS fallback
    ok, channel = await send_whatsapp_otp(db, to="+33612345678", otp_code="123456")
"""

import hashlib
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
_USER_PREFS_KEY = "user.preferences"


async def _is_event_channel_enabled(
    db: AsyncSession,
    *,
    user_id: str | None,
    event_type: str | None,
    channel: str,
) -> bool:
    if not user_id or not event_type:
        return True

    result = await db.execute(
        text(
            "SELECT value FROM settings "
            "WHERE key = :key AND scope = 'user' AND scope_id = :scope_id "
            "LIMIT 1"
        ),
        {"key": _USER_PREFS_KEY, "scope_id": str(user_id)},
    )
    raw = result.scalar_one_or_none()
    if not isinstance(raw, dict):
        return True

    event_matrix = raw.get("notification_event_matrix")
    if not isinstance(event_matrix, dict):
        return True

    event_settings = event_matrix.get(event_type)
    if not isinstance(event_settings, dict):
        return True

    return event_settings.get(channel, True) is not False


async def _get_messaging_settings(db: AsyncSession) -> list[tuple[str, dict[str, str]]]:
    """Return all configured messaging providers in priority order."""
    result = await db.execute(
        text(
            "SELECT key, value FROM settings"
            " WHERE (key LIKE 'integration.sms_%' OR key LIKE 'integration.whatsapp%')"
            " AND scope = 'entity'"
        )
    )
    all_settings: dict[str, str] = {}
    for row in result.all():
        val = row[1].get("v", "") if isinstance(row[1], dict) else str(row[1])
        all_settings[row[0]] = str(val) if val else ""

    providers: list[tuple[str, dict[str, str]]] = []

    # Check WhatsApp first (preferred — free OTP templates via Meta Cloud API)
    wa_keys = {k.replace("integration.whatsapp.", ""): v for k, v in all_settings.items() if k.startswith("integration.whatsapp.")}
    if wa_keys.get("phone_number_id") and wa_keys.get("access_token"):
        providers.append(("whatsapp", wa_keys))

    # Check OVH (preferred for FR SMS)
    ovh_keys = {k.replace("integration.sms_ovh.", ""): v for k, v in all_settings.items() if k.startswith("integration.sms_ovh.")}
    if ovh_keys.get("application_key") and ovh_keys.get("consumer_key"):
        providers.append(("ovh", ovh_keys))

    # Check Twilio
    twilio_keys = {k.replace("integration.sms_twilio.", ""): v for k, v in all_settings.items() if k.startswith("integration.sms_twilio.")}
    if twilio_keys.get("account_sid") and twilio_keys.get("auth_token"):
        providers.append(("twilio", twilio_keys))

    # Check Vonage
    vonage_keys = {k.replace("integration.sms_vonage.", ""): v for k, v in all_settings.items() if k.startswith("integration.sms_vonage.")}
    if vonage_keys.get("api_key") and vonage_keys.get("api_secret"):
        providers.append(("vonage", vonage_keys))

    return providers


async def _get_sms_settings(db: AsyncSession) -> tuple[str | None, dict[str, str]]:
    """Detect which SMS provider is configured and return (provider, settings).

    Backward-compatible helper — returns the first configured provider.
    """
    providers = await _get_messaging_settings(db)
    if providers:
        return providers[0]
    return None, {}


async def _get_admin_channel_default(db: AsyncSession, message_type: str = "otp") -> str:
    """Get admin-configured default channel for a message type.

    Setting key: auth.messaging_channel_{message_type} (otp, notification, alert).
    Returns: 'auto' | 'whatsapp' | 'sms' | 'email'. Default: 'auto'.
    """
    from app.models.common import Setting
    result = await db.execute(
        text(f"SELECT value FROM settings WHERE key = 'auth.messaging_channel_{message_type}' AND scope = 'tenant' LIMIT 1")
    )
    row = result.scalar()
    if row and isinstance(row, dict):
        return str(row.get("v", "auto"))
    return "auto"


async def _get_user_preferred_channel(db: AsyncSession, user_id: str | None) -> str:
    """Get user's preferred messaging channel. Returns 'auto' if not set."""
    if not user_id:
        return "auto"
    result = await db.execute(
        text("SELECT preferred_messaging_channel FROM users WHERE id = :uid LIMIT 1"),
        {"uid": user_id},
    )
    row = result.scalar()
    return str(row) if row and row != "auto" else "auto"


def _resolve_channel(user_pref: str, admin_default: str) -> str:
    """Resolve effective channel: user pref overrides admin default."""
    if user_pref and user_pref != "auto":
        return user_pref
    return admin_default


def _order_providers_by_channel(
    providers: list[tuple[str, dict[str, str]]],
    preferred: str,
) -> list[tuple[str, dict[str, str]]]:
    """Reorder providers so the preferred channel comes first.

    Channel mapping:
    - 'whatsapp' → whatsapp provider first
    - 'sms' → ovh/twilio/vonage providers first
    - 'auto' or 'email' → keep original priority order
    """
    if preferred == "auto" or preferred == "email":
        return providers

    if preferred == "whatsapp":
        wa = [p for p in providers if p[0] == "whatsapp"]
        rest = [p for p in providers if p[0] != "whatsapp"]
        return wa + rest

    if preferred == "sms":
        sms = [p for p in providers if p[0] != "whatsapp"]
        wa = [p for p in providers if p[0] == "whatsapp"]
        return sms + wa

    return providers


async def resolve_user_contact(db: AsyncSession, user_id: str, channel: str) -> str | None:
    """Resolve the best phone number or email for a user based on channel preference.

    Selection priority:
    1. Verified + default/primary first
    2. Verified + any
    3. Unverified + default (fallback, for testing)

    Args:
        channel: 'whatsapp' | 'sms' → returns phone number
                 'email' → returns email address
                 'auto' → returns phone (preferred), fallback to email
    """
    if channel in ("whatsapp", "sms", "auto"):
        # Find best phone: verified + is_default first, then verified, then any default
        result = await db.execute(
            text(
                "SELECT country_code, number, verified, is_default FROM phones"
                " WHERE owner_type = 'user' AND owner_id = :uid"
                " ORDER BY (verified AND is_default) DESC, verified DESC, is_default DESC, created_at ASC"
                " LIMIT 1"
            ),
            {"uid": user_id},
        )
        row = result.first()
        if row:
            cc = row[0] or ""
            number = row[1] or ""
            return f"{cc}{number}".strip()

        # No phone found — if auto, fallback to email
        if channel != "auto":
            return None

    # Email: find notification email > primary > verified > any
    result = await db.execute(
        text(
            "SELECT email FROM user_emails"
            " WHERE user_id = :uid"
            " ORDER BY is_notification DESC, is_primary DESC, verified DESC, created_at ASC"
            " LIMIT 1"
        ),
        {"uid": user_id},
    )
    row = result.first()
    return row[0] if row else None


async def send_to_user(
    db: AsyncSession,
    *,
    user_id: str,
    subject: str,
    body: str,
    message_type: str = "notification",
    event_type: str | None = None,
) -> tuple[bool, str]:
    """High-level: send a message to a user using their preferred channel + contact.

    Resolves channel preference, picks the right phone/email, dispatches.
    Returns (success, channel_used).
    """
    admin_default = await _get_admin_channel_default(db, message_type)
    user_pref = await _get_user_preferred_channel(db, user_id)
    effective = _resolve_channel(user_pref, admin_default)

    candidate_channels = {
        "email": ["email"],
        "whatsapp": ["whatsapp", "sms", "email"],
        "sms": ["sms", "whatsapp", "email"],
        "auto": ["whatsapp", "sms", "email"],
    }.get(effective, ["email"])

    user_result = await db.execute(
        text(
            "SELECT language, default_entity_id FROM users WHERE id = :uid LIMIT 1"
        ),
        {"uid": user_id},
    )
    user_row = user_result.first()

    for channel in candidate_channels:
        if not await _is_event_channel_enabled(
            db,
            user_id=user_id,
            event_type=event_type,
            channel=channel,
        ):
            continue

        contact = await resolve_user_contact(db, user_id, channel)
        if not contact:
            continue

        if channel == "email":
            try:
                from app.core.email_templates import render_and_send_email

                sent = await render_and_send_email(
                    db=db,
                    slug="queued_notification_email",
                    entity_id=user_row.default_entity_id if user_row else None,
                    language=(user_row.language or "fr") if user_row else "fr",
                    to=contact,
                    user_id=user_id,
                    category="core",
                    event_type=event_type or "queued_notification_email",
                    variables={
                        "notification": {
                            "title": subject,
                            "body": body,
                            "link": None,
                        },
                    },
                )
                if sent:
                    return True, "email"
            except Exception:
                logger.exception("Email send failed to %s", contact)
            continue

        sent, used_channel = await send_sms(
            db,
            to=contact,
            body=body,
            user_id=user_id,
            message_type=message_type,
            preferred_channel=channel,
            event_type=event_type,
        )
        if sent:
            return True, used_channel

    logger.warning("No eligible delivery channel for user %s (event=%s)", user_id, event_type)
    return False, ""


async def _send_ovh(cfg: dict[str, str], to: str, body: str) -> bool:
    """Send SMS via OVH API.

    Required settings: application_key, application_secret, consumer_key, service_name, sender.
    API doc: https://api.ovh.com/console/#/sms/{serviceName}/jobs#POST
    """
    import httpx

    app_key = cfg["application_key"]
    app_secret = cfg.get("application_secret", "")
    consumer_key = cfg["consumer_key"]
    service_name = cfg.get("service_name", "")
    sender = cfg.get("sender", "OpsFlux")

    if not service_name:
        logger.error("OVH SMS: service_name not configured")
        return False

    # Normalize phone number: remove spaces/dashes, ensure E.164 format
    normalized = to.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not normalized.startswith("+"):
        normalized = "+" + normalized

    url = f"https://eu.api.ovh.com/1.0/sms/{service_name}/jobs"
    timestamp = str(int(time.time()))

    payload = {
        "charset": "UTF-8",
        "class": "phoneDisplay",
        "coding": "7bit",
        "message": body,
        "noStopClause": True,
        "priority": "high",
        "receivers": [normalized],
        "sender": sender,
        "senderForResponse": False,
    }

    import json
    body_str = json.dumps(payload)

    # OVH signature: "$1$" + SHA1(app_secret + "+" + consumer_key + "+" + method + "+" + url + "+" + body + "+" + timestamp)
    to_sign = f"{app_secret}+{consumer_key}+POST+{url}+{body_str}+{timestamp}"
    signature = "$1$" + hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

    headers = {
        "X-Ovh-Application": app_key,
        "X-Ovh-Consumer": consumer_key,
        "X-Ovh-Timestamp": timestamp,
        "X-Ovh-Signature": signature,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, content=body_str, headers=headers)
        if resp.status_code in (200, 201):
            logger.info("OVH SMS sent to %s", to)
            return True
        logger.error("OVH SMS failed: HTTP %s — %s", resp.status_code, resp.text[:300])
        return False


async def _send_twilio(cfg: dict[str, str], to: str, body: str) -> bool:
    """Send SMS via Twilio API."""
    import httpx

    account_sid = cfg["account_sid"]
    auth_token = cfg["auth_token"]
    from_number = cfg.get("from_number", "")

    if not from_number:
        logger.error("Twilio SMS: from_number not configured")
        return False

    normalized = to.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not normalized.startswith("+"):
        normalized = "+" + normalized

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            data={"To": normalized, "From": from_number, "Body": body},
            auth=(account_sid, auth_token),
        )
        if resp.status_code in (200, 201):
            logger.info("Twilio SMS sent to %s", to)
            return True
        logger.error("Twilio SMS failed: HTTP %s — %s", resp.status_code, resp.text[:300])
        return False


async def _send_vonage(cfg: dict[str, str], to: str, body: str) -> bool:
    """Send SMS via Vonage API."""
    import httpx

    api_key = cfg["api_key"]
    api_secret = cfg["api_secret"]
    sender = cfg.get("sender", "OpsFlux")

    normalized = to.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")

    url = "https://rest.nexmo.com/sms/json"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={
            "api_key": api_key,
            "api_secret": api_secret,
            "to": normalized.replace("+", ""),
            "from": sender,
            "text": body,
        })
        if resp.status_code == 200:
            data = resp.json()
            messages = data.get("messages", [])
            if messages and messages[0].get("status") == "0":
                logger.info("Vonage SMS sent to %s", to)
                return True
            error = messages[0].get("error-text", "unknown") if messages else "no response"
            logger.error("Vonage SMS failed: %s", error)
            return False
        logger.error("Vonage SMS failed: HTTP %s", resp.status_code)
        return False


async def _send_whatsapp(cfg: dict[str, str], to: str, body: str) -> bool:
    """Send a text message via WhatsApp Cloud API (Meta Graph API).

    Required settings: phone_number_id, access_token.
    Optional: api_version (default v21.0).
    API doc: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
    """
    import httpx

    phone_number_id = cfg["phone_number_id"]
    access_token = cfg["access_token"]
    api_version = cfg.get("api_version", "v21.0")

    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"

    # Normalize number: WhatsApp expects digits only without '+'
    wa_number = to.lstrip("+").replace(" ", "").replace("-", "")

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": wa_number,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )
        if resp.status_code in (200, 201):
            logger.info("WhatsApp message sent to %s", to)
            return True
        logger.error("WhatsApp failed: HTTP %s — %s", resp.status_code, resp.text[:300])
        return False


async def _send_whatsapp_otp_template(cfg: dict[str, str], to: str, otp_code: str) -> bool:
    """Send an OTP via WhatsApp authentication template (Meta Cloud API).

    Uses the pre-approved 'authentication' category template for zero-tap / copy-code OTP.
    Required settings: phone_number_id, access_token.
    Optional: otp_template_name (default: the auto-generated auth template), language (default: fr).
    """
    import httpx

    phone_number_id = cfg["phone_number_id"]
    access_token = cfg["access_token"]
    api_version = cfg.get("api_version", "v21.0")
    template_name = cfg.get("otp_template_name", "")
    language = cfg.get("language", "fr")

    wa_number = to.lstrip("+").replace(" ", "").replace("-", "")
    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"

    if template_name:
        # Use a named authentication template with OTP button
        payload = {
            "messaging_product": "whatsapp",
            "to": wa_number,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": otp_code}],
                    },
                    {
                        "type": "button",
                        "sub_type": "url",
                        "index": "0",
                        "parameters": [{"type": "text", "text": otp_code}],
                    },
                ],
            },
        }
    else:
        # Fallback: send as plain text message
        payload = {
            "messaging_product": "whatsapp",
            "to": wa_number,
            "type": "text",
            "text": {"preview_url": False, "body": f"OpsFlux — Votre code de vérification : {otp_code}"},
        }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )
        if resp.status_code in (200, 201):
            logger.info("WhatsApp OTP sent to %s via %s", to, "template" if template_name else "text")
            return True
        logger.error("WhatsApp OTP failed: HTTP %s — %s", resp.status_code, resp.text[:300])
        return False


async def send_sms(
    db: AsyncSession,
    *,
    to: str,
    body: str,
    user_id: str | None = None,
    message_type: str = "notification",
    preferred_channel: str | None = None,
    event_type: str | None = None,
) -> tuple[bool, str]:
    """Send a message with fallback cascade + channel preference.

    Tries each configured provider in order (respecting user/admin channel
    preference) until one succeeds. Returns (success, channel_used).

    Args:
        to: Phone number with country code (e.g. +33612345678)
        body: Message text
        user_id: Optional user ID to resolve preferred channel
        message_type: 'otp' | 'notification' | 'alert' — determines admin default channel
    """
    providers = await _get_messaging_settings(db)
    if not providers:
        logger.warning("No messaging provider configured. Message to %s not sent.", to)
        return False, ""

    # Resolve channel preference: explicit > user > admin > auto
    admin_default = await _get_admin_channel_default(db, message_type)
    user_pref = await _get_user_preferred_channel(db, user_id)
    effective = preferred_channel or _resolve_channel(user_pref, admin_default)

    if not await _is_event_channel_enabled(
        db,
        user_id=user_id,
        event_type=event_type,
        channel="whatsapp" if effective == "whatsapp" else "sms",
    ):
        logger.info(
            "Messaging skipped by event preference (user=%s, event=%s, channel=%s)",
            user_id,
            event_type,
            effective,
        )
        return False, ""

    # Reorder providers to match preference
    ordered = _order_providers_by_channel(providers, effective)

    # Fallback cascade: try each provider in order
    _SENDERS = {
        "whatsapp": _send_whatsapp,
        "ovh": _send_ovh,
        "twilio": _send_twilio,
        "vonage": _send_vonage,
    }

    for provider, cfg in ordered:
        sender = _SENDERS.get(provider)
        if not sender:
            continue
        try:
            ok = await sender(cfg, to, body)
            if ok:
                return True, provider
            logger.warning("Provider %s failed for %s, trying next...", provider, to)
        except Exception:
            logger.exception("Provider %s error for %s, trying next...", provider, to)

    logger.error("All messaging providers failed for %s", to)
    return False, ""


async def send_whatsapp_otp(
    db: AsyncSession,
    *,
    to: str,
    otp_code: str,
    user_id: str | None = None,
) -> tuple[bool, str]:
    """Send OTP with channel preference.

    If preferred channel is WhatsApp and available → WhatsApp OTP template.
    If preferred channel is SMS → skip WhatsApp, go to SMS directly.
    Fallback: always try all available providers.

    Returns (success, channel_used).
    """
    providers = await _get_messaging_settings(db)
    if not providers:
        return False, ""

    admin_default = await _get_admin_channel_default(db, "otp")
    user_pref = await _get_user_preferred_channel(db, user_id)
    effective = _resolve_channel(user_pref, admin_default)

    ordered = _order_providers_by_channel(providers, effective)

    # Try WhatsApp OTP template first (if whatsapp is in the ordered list)
    for provider, cfg in ordered:
        if provider == "whatsapp":
            try:
                ok = await _send_whatsapp_otp_template(cfg, to, otp_code)
                if ok:
                    return True, "whatsapp"
            except Exception:
                logger.exception("WhatsApp OTP template failed for %s", to)

    # Fallback: send OTP as plain text via any available SMS provider
    otp_text = f"OpsFlux — Votre code de vérification : {otp_code}"
    _SENDERS = {"ovh": _send_ovh, "twilio": _send_twilio, "vonage": _send_vonage}

    for provider, cfg in ordered:
        sender = _SENDERS.get(provider)
        if not sender:
            continue
        try:
            ok = await sender(cfg, to, otp_text)
            if ok:
                return True, provider
        except Exception:
            logger.exception("SMS OTP via %s failed for %s", provider, to)

    logger.error("All OTP providers failed for %s", to)
    return False, ""

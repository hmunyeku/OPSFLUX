"""SMS sending service — dispatches to configured provider (OVH, Twilio, Vonage).

Usage:
    from app.core.sms_service import send_sms
    sent = await send_sms(db, to="+33612345678", body="Your OTP: 123456")
"""

import hashlib
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def _get_sms_settings(db: AsyncSession) -> tuple[str | None, dict[str, str]]:
    """Detect which SMS provider is configured and return (provider, settings)."""
    result = await db.execute(
        text("SELECT key, value FROM settings WHERE key LIKE 'integration.sms_%' AND scope = 'entity'")
    )
    all_settings: dict[str, str] = {}
    for row in result.all():
        val = row[1].get("v", "") if isinstance(row[1], dict) else str(row[1])
        all_settings[row[0]] = str(val) if val else ""

    # Check OVH first (preferred for FR)
    ovh_keys = {k.replace("integration.sms_ovh.", ""): v for k, v in all_settings.items() if k.startswith("integration.sms_ovh.")}
    if ovh_keys.get("application_key") and ovh_keys.get("consumer_key"):
        return "ovh", ovh_keys

    # Check Twilio
    twilio_keys = {k.replace("integration.sms_twilio.", ""): v for k, v in all_settings.items() if k.startswith("integration.sms_twilio.")}
    if twilio_keys.get("account_sid") and twilio_keys.get("auth_token"):
        return "twilio", twilio_keys

    # Check Vonage
    vonage_keys = {k.replace("integration.sms_vonage.", ""): v for k, v in all_settings.items() if k.startswith("integration.sms_vonage.")}
    if vonage_keys.get("api_key") and vonage_keys.get("api_secret"):
        return "vonage", vonage_keys

    return None, {}


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

    url = f"https://eu.api.ovh.com/1.0/sms/{service_name}/jobs"
    timestamp = str(int(time.time()))

    payload = {
        "charset": "UTF-8",
        "class": "phoneDisplay",
        "coding": "7bit",
        "message": body,
        "noStopClause": True,
        "priority": "high",
        "receivers": [to],
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

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            data={"To": to, "From": from_number, "Body": body},
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

    url = "https://rest.nexmo.com/sms/json"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={
            "api_key": api_key,
            "api_secret": api_secret,
            "to": to.replace("+", ""),
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


async def send_sms(db: AsyncSession, *, to: str, body: str) -> bool:
    """Send an SMS using the configured provider. Returns True if sent."""
    provider, cfg = await _get_sms_settings(db)

    if not provider:
        logger.warning("SMS not configured — no provider found. Message to %s not sent.", to)
        return False

    try:
        if provider == "ovh":
            return await _send_ovh(cfg, to, body)
        elif provider == "twilio":
            return await _send_twilio(cfg, to, body)
        elif provider == "vonage":
            return await _send_vonage(cfg, to, body)
        else:
            logger.error("Unknown SMS provider: %s", provider)
            return False
    except Exception:
        logger.exception("Failed to send SMS to %s via %s", to, provider)
        return False

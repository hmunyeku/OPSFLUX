"""
Rise Up LMS Connector — fetches training/certification compliance from Rise Up API v3.

API docs: https://api.riseup.ai/documentation
Auth: OAuth 2.0 client_credentials → Bearer token (3600s)
Rate limit: 300 calls/min
Pagination: 206 Partial Content + Content-Range header

Key endpoints:
    GET /v3/certificateuser?iduser={id} → certificates with state (certified/expired)
    GET /v3/courseregistrations?iduser={id} → training enrollments with progress/state
    GET /v3/users?email={email} or ?rhid={rhid} → user lookup
    GET /v3/certificates → certificate definitions
"""

import base64
import logging
from datetime import date, datetime

import httpx

from app.services.connectors.compliance_connector import (
    ComplianceConnector,
    ExternalComplianceRecord,
    ExternalUserMatch,
    register_compliance_connector,
)

logger = logging.getLogger(__name__)


@register_compliance_connector("riseup")
class RiseUpConnector(ComplianceConnector):
    """Rise Up LMS compliance connector."""

    provider_id = "riseup"
    provider_name = "Rise Up"

    def __init__(self, settings: dict[str, str]):
        self.base_url = (settings.get("base_url") or "https://api.riseup.ai").rstrip("/")
        self.public_key = settings.get("public_key", "")
        self.secret_key = settings.get("secret_key", "")
        self.match_field = settings.get("match_field", "both")  # email | rhid | both
        self._token: str | None = None

    async def authenticate(self) -> None:
        """OAuth 2.0 client_credentials flow."""
        if not self.public_key or not self.secret_key:
            raise ValueError("Rise Up API keys not configured")

        credentials = base64.b64encode(f"{self.public_key}:{self.secret_key}".encode()).decode()

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.base_url}/oauth/token",
                data="grant_type=client_credentials",
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data.get("access_token")
            if not self._token:
                raise ValueError("No access_token in Rise Up response")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    async def _get(self, path: str, params: dict | None = None) -> list[dict]:
        """GET with pagination handling (206 Partial Content)."""
        results: list[dict] = []
        url = f"{self.base_url}/v3{path}"

        async with httpx.AsyncClient(timeout=30) as client:
            while url:
                resp = await client.get(url, params=params, headers=self._headers())
                params = None  # Only use params on first request

                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        results.extend(data)
                    return results

                if resp.status_code == 206:
                    data = resp.json()
                    if isinstance(data, list):
                        results.extend(data)
                    # Follow Link header for next page
                    link = resp.headers.get("Link", "")
                    if 'rel="next"' in link:
                        # Parse: <url>; rel="next"
                        url = link.split(";")[0].strip("<>")
                    else:
                        break
                else:
                    logger.error("Rise Up API %s: HTTP %s — %s", path, resp.status_code, resp.text[:200])
                    break

        return results

    async def test_connection(self) -> tuple[str, str]:
        """Test by fetching company info."""
        try:
            await self.authenticate()
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{self.base_url}/v3/company",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    name = data.get("name", "OK")
                    return "ok", f"Rise Up connecté — {name}"
                return "error", f"Rise Up: HTTP {resp.status_code}"
        except Exception as e:
            return "error", f"Rise Up: {str(e)[:200]}"

    async def match_user(self, email: str, intranet_id: str | None = None) -> ExternalUserMatch | None:
        """Match OpsFlux user to Rise Up user based on configured match_field.

        match_field:
            'rhid' — match by matricule RH only (intranet_id → rhid)
            'email' — match by email only
            'both' — try rhid first, fallback to email (default)
        """
        # Try rhid if configured
        if self.match_field in ("rhid", "both") and intranet_id:
            users = await self._get("/users", {"rhid": intranet_id})
            if users:
                u = users[0]
                return ExternalUserMatch(
                    external_user_id=str(u["id"]),
                    matched_by="rhid",
                    external_name=f"{u.get('firstname', '')} {u.get('lastname', '')}".strip(),
                )

        # Try email if configured
        if self.match_field in ("email", "both") and email:
            users = await self._get("/users", {"email": email})
            if users:
                u = users[0]
                return ExternalUserMatch(
                    external_user_id=str(u["id"]),
                    matched_by="email",
                    external_name=f"{u.get('firstname', '')} {u.get('lastname', '')}".strip(),
                )

        return None

    async def get_user_compliance(
        self,
        external_user_id: str,
        type_mapping: dict[str, str] | None = None,
    ) -> list[ExternalComplianceRecord]:
        """Fetch all certificates + course registrations for a Rise Up user."""
        records: list[ExternalComplianceRecord] = []

        # 1) Certificates (certified/expired)
        cert_users = await self._get("/certificateuser", {"iduser": external_user_id})
        for cu in cert_users:
            for user_entry in cu.get("users", []):
                if str(user_entry.get("id")) != external_user_id:
                    continue

                ext_cert_id = str(cu.get("idcertificate", ""))

                # If type_mapping provided, only include mapped certificates
                if type_mapping and ext_cert_id not in type_mapping.values():
                    continue

                state = user_entry.get("state", "")
                cert_date_str = user_entry.get("certificationdate", "")
                cert_date = _parse_date(cert_date_str)

                records.append(
                    ExternalComplianceRecord(
                        external_id=f"cert:{ext_cert_id}:user:{external_user_id}",
                        user_external_id=external_user_id,
                        type_external_id=ext_cert_id,
                        status="valid" if state == "certified" else "expired" if state == "expired" else "pending",
                        title=cu.get("type", "Certificate"),
                        issued_at=cert_date,
                        extra={"riseup_state": state, "riseup_type": cu.get("type")},
                    )
                )

        # 2) Course registrations (validated/pending/etc.)
        registrations = await self._get("/courseregistrations", {"iduser": external_user_id})
        for reg in registrations:
            ext_training_id = str(reg.get("idtraining", ""))

            if type_mapping and ext_training_id not in type_mapping.values():
                continue

            state = reg.get("state", "")
            progress = reg.get("progress", 0)

            # Map RiseUp state to OpsFlux status
            if state == "validated" and progress == 100:
                status = "valid"
            elif state in ("pending", "validated") and progress < 100:
                status = "pending"
            elif state in ("cancelled", "refused", "archived"):
                status = "expired"
            else:
                status = "pending"

            records.append(
                ExternalComplianceRecord(
                    external_id=f"reg:{reg.get('id')}",
                    user_external_id=external_user_id,
                    type_external_id=ext_training_id,
                    status=status,
                    title=f"Training #{ext_training_id}",
                    issued_at=_parse_date(reg.get("subscribedate")),
                    expires_at=_parse_date(reg.get("trainingenddate")),
                    progress=progress,
                    score=reg.get("score"),
                    extra={"riseup_state": state, "riseup_registration_id": reg.get("id")},
                )
            )

        return records

    async def get_certificate_status(
        self,
        external_user_id: str,
        external_certificate_id: str,
    ) -> ExternalComplianceRecord | None:
        """Check a specific certificate for a user."""
        cert_users = await self._get(
            "/certificateuser",
            {
                "iduser": external_user_id,
                "idcertificate": external_certificate_id,
            },
        )

        for cu in cert_users:
            for user_entry in cu.get("users", []):
                if str(user_entry.get("id")) != external_user_id:
                    continue

                state = user_entry.get("state", "")
                return ExternalComplianceRecord(
                    external_id=f"cert:{external_certificate_id}:user:{external_user_id}",
                    user_external_id=external_user_id,
                    type_external_id=external_certificate_id,
                    status="valid" if state == "certified" else "expired",
                    issued_at=_parse_date(user_entry.get("certificationdate")),
                    extra={"riseup_state": state},
                )

        return None


def _parse_date(val: str | None) -> date | None:
    """Parse Rise Up date format 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD'."""
    if not val:
        return None
    try:
        return datetime.strptime(val[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None

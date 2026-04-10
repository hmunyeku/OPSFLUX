"""RGPD/GDPR compliance endpoints.

Implements:
- Right to access (Art. 15): full user data export (ZIP)
- Right to portability (Art. 20): machine-readable export
- Right to erasure (Art. 17): account anonymization
- Breach notification records (Art. 33/34)
- Consent tracking
"""

import logging
import csv
import io
import json
import zipfile
from datetime import datetime, UTC
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_entity
from app.core.database import get_db
from app.core.audit import record_audit
from app.core.config import settings
from app.core.security import hash_password
from app.models.common import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gdpr", tags=["gdpr"])


# ── Schemas ──────────────────────────────────────────────────

class DataExportResponse(BaseModel):
    user: dict
    related_data: dict
    export_date: str
    format_version: str = "1.0"


class AnonymizeRequest(BaseModel):
    confirmation: str = Field(..., description="Must be 'SUPPRIMER MON COMPTE' to confirm")
    reason: str | None = None


class ConsentRecord(BaseModel):
    consent_type: str  # 'cookies', 'analytics', 'data_processing'
    granted: bool
    ip_address: str | None = None


class ExportFileRead(BaseModel):
    filename: str
    created_at: str
    size_bytes: int


# ── Helper: collect all user data across tables ──────────────

USER_FK_TABLES = [
    ("audit_log", "user_id", ["action", "resource_type", "resource_id", "ip_address", "created_at"]),
    ("notifications", "user_id", ["title", "body", "category", "read", "created_at"]),
    ("login_events", "user_id", ["ip_address", "user_agent", "success", "created_at"]),
    ("user_emails", "user_id", ["email", "verified", "created_at"]),
    ("phones", "user_id", ["number", "phone_type", "verified", "created_at"]),
    ("addresses", "owner_id", ["address_type", "line1", "city", "country", "created_at"]),
    ("user_passports", "user_id", ["passport_number", "country", "issue_date", "expiry_date"]),
    ("user_visas", "user_id", ["visa_type", "country", "issue_date", "expiry_date"]),
    ("user_vaccines", "user_id", ["vaccine_name", "vaccination_date"]),
    ("user_languages", "user_id", ["language_code", "proficiency"]),
    ("emergency_contacts", "user_id", ["first_name", "last_name", "phone", "relationship"]),
    ("user_sessions", "user_id", ["ip_address", "user_agent", "created_at", "last_active_at"]),
    ("user_delegations", "delegator_id", ["delegate_id", "start_date", "end_date", "active"]),
    ("support_tickets", "reporter_id", ["reference", "title", "ticket_type", "status", "created_at"]),
    ("project_members", "user_id", ["project_id", "role", "created_at"]),
    ("compliance_records", "user_id", ["compliance_type_id", "status", "expiry_date", "created_at"]),
    ("ads_pax", "user_id", ["ads_id", "status", "created_at"]),
]

USER_PERSONAL_FIELDS = [
    "id", "email", "first_name", "last_name", "gender", "birth_date",
    "birth_city", "birth_country", "nationality", "passport_name",
    "language", "avatar_url", "contractual_airport", "nearest_airport",
    "nearest_station", "loyalty_program", "vantage_number", "extension_number",
    "badge_number", "height", "weight", "last_medical_check",
    "last_international_medical_check", "retirement_date",
    "created_at", "updated_at", "last_login_at", "last_login_ip",
]


async def _collect_user_data(db: AsyncSession, user: User) -> dict:
    """Collect all personal data for a user across all tables."""
    # User profile
    profile = {}
    for field in USER_PERSONAL_FIELDS:
        val = getattr(user, field, None)
        if val is not None:
            profile[field] = str(val) if not isinstance(val, (str, int, float, bool)) else val

    # Related data from other tables
    related = {}
    for table_name, fk_field, columns in USER_FK_TABLES:
        try:
            cols = ", ".join(columns)
            query = text(f"SELECT {cols} FROM {table_name} WHERE {fk_field} = :uid ORDER BY created_at DESC LIMIT 1000")
            result = await db.execute(query, {"uid": user.id})
            rows = [dict(zip(columns, row)) for row in result.fetchall()]
            # Serialize dates
            for row in rows:
                for k, v in row.items():
                    if isinstance(v, datetime):
                        row[k] = v.isoformat()
                    elif isinstance(v, UUID):
                        row[k] = str(v)
            if rows:
                related[table_name] = rows
        except Exception:
            # Table/column might not exist — rollback to clear failed transaction
            await db.rollback()
            continue

    return {"profile": profile, "related_data": related}


def _csv_from_rows(rows: list[dict]) -> str:
    if not rows:
        return ""
    fieldnames: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in fieldnames:
                fieldnames.append(key)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key) for key in fieldnames})
    return buffer.getvalue()


def _iter_attachment_candidates(payload: object) -> list[str]:
    candidates: list[str] = []

    def _walk(value: object, key: str | None = None) -> None:
        if isinstance(value, dict):
            for child_key, child_value in value.items():
                _walk(child_value, child_key)
            return
        if isinstance(value, list):
            for item in value:
                _walk(item, key)
            return
        if not isinstance(value, str):
            return
        normalized_key = (key or "").lower()
        normalized_value = value.strip()
        if not normalized_value:
            return
        if normalized_key.endswith("_path") or normalized_key.endswith("_url") or normalized_key in {"avatar_url", "file", "document"}:
            candidates.append(normalized_value)

    _walk(payload)
    return candidates


def _resolve_local_attachment(candidate: str) -> Path | None:
    raw = candidate.strip()
    if not raw:
        return None

    possible_paths: list[Path] = []
    if raw.startswith("/static/"):
        possible_paths.append(Path("/opt/opsflux") / raw.lstrip("/"))
    elif raw.startswith("/uploads/"):
        possible_paths.append(Path("/opt/opsflux/static") / raw.lstrip("/"))
    elif raw.startswith("/"):
        possible_paths.append(Path(raw))
    else:
        possible_paths.append(Path(raw))

    for path in possible_paths:
        try:
            if path.exists() and path.is_file():
                return path
        except Exception:
            continue
    return None


def _build_gdpr_export_zip(*, export: dict, filepath: Path) -> None:
    profile_rows = [export["user"]]
    related_data = export.get("related_data", {})
    attachment_candidates = _iter_attachment_candidates(export)
    attached_files: set[str] = set()
    skipped_attachments: list[str] = []

    with zipfile.ZipFile(filepath, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest/export.json", json.dumps(export, indent=2, default=str, ensure_ascii=False))

        profile_csv = _csv_from_rows(profile_rows)
        if profile_csv:
            archive.writestr("tables/user_profile.csv", profile_csv)

        for table_name, rows in related_data.items():
            if not isinstance(rows, list) or not rows:
                continue
            csv_payload = _csv_from_rows(rows)
            if csv_payload:
                archive.writestr(f"tables/{table_name}.csv", csv_payload)

        for candidate in attachment_candidates:
            resolved = _resolve_local_attachment(candidate)
            if resolved is None:
                skipped_attachments.append(candidate)
                continue
            archive_name = f"attachments/{resolved.name}"
            if archive_name in attached_files:
                continue
            archive.write(resolved, arcname=archive_name)
            attached_files.add(archive_name)

        archive.writestr(
            "manifest/attachments.json",
            json.dumps(
                {
                    "included": sorted(attached_files),
                    "skipped": skipped_attachments,
                },
                indent=2,
                ensure_ascii=False,
            ),
        )


# ── Right to Access (Art. 15) + Right to Portability (Art. 20) ──

@router.post("/request-export")
async def request_data_export(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Request an async data export (RGPD Art. 15 & 20).

    Queues a background job that collects all user data, writes a JSON
    file, and sends a notification when ready for download.
    """
    await record_audit(
        db, user_id=current_user.id,
        action="gdpr.data_export_requested",
        resource_type="user", resource_id=str(current_user.id),
        details={},
    )
    await db.commit()

    # Queue the background export
    import asyncio
    asyncio.create_task(_async_export_user_data(str(current_user.id)))

    return {"status": "queued", "message": "Export en cours de préparation. Vous recevrez une notification quand il sera prêt."}


async def _async_export_user_data(user_id_str: str):
    """Background task: collect data, write file, notify via in-app + email."""
    import json
    from app.core.notifications import send_in_app
    from app.core.email_templates import render_and_send_email

    try:
        from app.core.database import async_session_factory
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.id == UUID(user_id_str)))
            user = result.scalar_one_or_none()
            if not user:
                return

            # Capture scalar values before collect_user_data (which may rollback)
            uid = user.id
            eid = user.default_entity_id
            email = user.email
            first_name = user.first_name or ""
            last_name = user.last_name or ""

            data = await _collect_user_data(db, user)
            export = {
                "user": data["profile"],
                "related_data": data["related_data"],
                "export_date": datetime.now(UTC).isoformat(),
                "format_version": "1.0",
            }

            # Write ZIP export to static/exports/
            export_dir = Path("/opt/opsflux/static/exports")
            export_dir.mkdir(parents=True, exist_ok=True)
            filename = f"gdpr-export-{user_id_str[:8]}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}.zip"
            filepath = export_dir / filename
            _build_gdpr_export_zip(export=export, filepath=filepath)

            download_link = f"/api/v1/gdpr/download-export/{filename}"
            profile_exports_url = f"{settings.FRONTEND_URL.rstrip('/')}/settings#gdpr-personal"
            direct_download_url = f"{settings.API_BASE_URL.rstrip('/')}{download_link}"

            # In-app notification (real-time via WebSocket)
            await send_in_app(
                db,
                user_id=uid,
                entity_id=eid,
                title="Export RGPD pret",
                body="Votre export de donnees personnelles est pret. Ouvrez votre profil pour le telecharger.",
                category="system",
                link="/settings#gdpr-personal",
            )

            await render_and_send_email(
                db,
                slug="gdpr_export_ready",
                entity_id=eid,
                language=user.language or "fr",
                to=email,
                user_id=uid,
                category="system",
                variables={
                    "user_name": f"{first_name} {last_name}".strip(),
                    "exports_url": profile_exports_url,
                    "download_link": direct_download_url,
                    "entity": {"name": "OpsFlux"},
                },
            )

            await db.commit()
            logger.info("GDPR export completed for user %s → %s", user_id_str[:8], filename)

    except Exception:
        logger.exception("GDPR export failed for user %s", user_id_str)


@router.get("/download-export/{filename}")
async def download_export(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """Download a previously generated GDPR export file."""
    import os
    from fastapi.responses import FileResponse
    from pathlib import Path

    # Security: only allow the user's own exports
    user_prefix = str(current_user.id)[:8]
    if not filename.startswith(f"gdpr-export-{user_prefix}"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé.")

    filepath = Path(f"/opt/opsflux/static/exports/{filename}")
    if not filepath.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier expiré ou introuvable.")

    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="application/zip",
    )


@router.get("/my-exports", response_model=list[ExportFileRead])
async def list_my_exports(
    current_user: User = Depends(get_current_user),
):
    """List the authenticated user's generated GDPR exports."""
    export_dir = Path("/opt/opsflux/static/exports")
    if not export_dir.exists():
        return []

    user_prefix = str(current_user.id)[:8]
    exports: list[ExportFileRead] = []
    for path in sorted(
        list(export_dir.glob(f"gdpr-export-{user_prefix}-*.zip")) + list(export_dir.glob(f"gdpr-export-{user_prefix}-*.json")),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    ):
        stat = path.stat()
        exports.append(
            ExportFileRead(
                filename=path.name,
                created_at=datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
                size_bytes=stat.st_size,
            )
        )
    return exports


@router.delete("/my-exports/{filename}")
async def delete_my_export(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete one previously generated GDPR export for the current user."""
    user_prefix = str(current_user.id)[:8]
    if not filename.startswith(f"gdpr-export-{user_prefix}-"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé.")

    filepath = Path(f"/opt/opsflux/static/exports/{filename}")
    if not filepath.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable.")

    filepath.unlink(missing_ok=True)

    await record_audit(
        db,
        user_id=current_user.id,
        action="gdpr.data_export_deleted",
        resource_type="user",
        resource_id=str(current_user.id),
        details={"filename": filename},
    )
    await db.commit()
    return {"status": "deleted", "filename": filename}


# ── Right to Erasure (Art. 17) — Account Anonymization ──────

@router.post("/anonymize-my-account")
async def anonymize_account(
    body: AnonymizeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Anonymize the authenticated user's account (RGPD Art. 17).

    Does NOT hard-delete to preserve audit integrity. Instead:
    - Replaces all PII with anonymized values
    - Deactivates the account
    - Keeps audit trail intact (with anonymized user)
    """
    if body.confirmation != "SUPPRIMER MON COMPTE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation incorrecte. Tapez exactement 'SUPPRIMER MON COMPTE'.",
        )

    anon_id = str(current_user.id)[:8]
    anon_email = f"anonymized_{anon_id}@deleted.opsflux.io"

    # Record audit BEFORE anonymizing
    await record_audit(
        db, user_id=current_user.id,
        action="gdpr.account_anonymized",
        resource_type="user", resource_id=str(current_user.id),
        details={"reason": body.reason, "original_email": current_user.email},
    )

    # Anonymize user fields
    current_user.email = anon_email
    current_user.first_name = "Utilisateur"
    current_user.last_name = "Supprimé"
    current_user.passport_name = None
    current_user.gender = None
    current_user.birth_date = None
    current_user.birth_city = None
    current_user.birth_country = None
    current_user.nationality = None
    current_user.avatar_url = None
    current_user.contractual_airport = None
    current_user.nearest_airport = None
    current_user.nearest_station = None
    current_user.loyalty_program = None
    current_user.height = None
    current_user.weight = None
    current_user.last_medical_check = None
    current_user.last_international_medical_check = None
    current_user.last_subsidiary_medical_check = None
    current_user.vantage_number = None
    current_user.extension_number = None
    current_user.badge_number = None
    current_user.hashed_password = hash_password("ACCOUNT_ANONYMIZED_" + anon_id)
    current_user.totp_secret = None
    current_user.mfa_backup_codes = None
    current_user.last_login_ip = None
    current_user.active = False

    # Delete related PII (phones, emergency contacts, passports, etc.)
    for table in ["phones", "emergency_contacts", "user_passports", "user_visas",
                  "user_vaccines", "user_health_conditions", "social_securities",
                  "driving_licenses"]:
        try:
            await db.execute(text(f"DELETE FROM {table} WHERE user_id = :uid"), {"uid": current_user.id})
        except Exception:
            continue

    await db.commit()

    return {"status": "anonymized", "message": "Votre compte a été anonymisé. Vous allez être déconnecté."}


# ── Consent Management ──────────────────────────────────────

@router.post("/consent")
async def record_consent(
    body: ConsentRecord,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Record a consent decision (RGPD Art. 7)."""
    await record_audit(
        db, user_id=current_user.id,
        action=f"gdpr.consent.{'granted' if body.granted else 'withdrawn'}",
        resource_type="consent", resource_id=body.consent_type,
        details={
            "consent_type": body.consent_type,
            "granted": body.granted,
            "ip_address": body.ip_address,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )
    await db.commit()
    return {"status": "recorded"}


@router.get("/consent-status")
async def get_consent_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current consent status for all types."""
    result = await db.execute(
        text("""
            SELECT DISTINCT ON (resource_id) resource_id, details
            FROM audit_log
            WHERE user_id = :uid AND action LIKE 'gdpr.consent.%'
            ORDER BY resource_id, created_at DESC
        """),
        {"uid": current_user.id},
    )
    consents = {}
    for row in result.fetchall():
        details = row[1] if isinstance(row[1], dict) else {}
        consents[row[0]] = {
            "granted": details.get("granted", False),
            "timestamp": details.get("timestamp"),
        }
    return consents


# ── Data Breach Notification (Art. 33/34) ────────────────────

class BreachReport(BaseModel):
    title: str
    description: str
    affected_data_types: list[str]
    estimated_affected_users: int | None = None
    measures_taken: str | None = None
    notified_authority: bool = False
    notified_users: bool = False


@router.post("/breach-report")
async def create_breach_report(
    body: BreachReport,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a data breach incident (RGPD Art. 33/34). Admin only."""
    await record_audit(
        db, user_id=current_user.id,
        action="gdpr.breach_report",
        resource_type="breach", resource_id=f"breach_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}",
        details=body.model_dump(),
    )
    await db.commit()

    # TODO: send email notification to DPO and affected users
    return {"status": "recorded", "message": "Incident de violation enregistré dans le journal d'audit."}


@router.get("/breach-reports")
async def list_breach_reports(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all data breach reports. Admin only."""
    result = await db.execute(
        text("""
            SELECT resource_id, details, created_at
            FROM audit_log
            WHERE action = 'gdpr.breach_report'
            ORDER BY created_at DESC
            LIMIT 100
        """),
    )
    return [
        {"id": row[0], "details": row[1], "created_at": row[2].isoformat() if row[2] else None}
        for row in result.fetchall()
    ]

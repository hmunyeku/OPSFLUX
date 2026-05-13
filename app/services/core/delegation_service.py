"""Delegation traceability service — email notifications + PDF certificate.

Bastien : "Il faut un mail et un PDF (en utilisant les systeme core) pour
informer qu'on a recu une delegation, ou qu'on a donne une delegation; etc.
Dans le cadre de l'ISO toute delegation doit etre tracable."

Pour chaque évènement (granted / revoked) :
  1. Génère un PDF certificat de traçabilité ISO via render_pdf("delegation.certificate")
  2. Stocke le PDF en attachment polymorphique (owner_type='delegation', owner_id=<delegation.id>)
  3. Envoie un email au délégant (slug=delegation_granted) avec lien vers le PDF
  4. Envoie un email au délégataire (slug=delegation_received) avec lien vers le PDF

Toutes les opérations sont best-effort : un échec d'email ou de PDF ne doit
PAS faire échouer la création de la délégation elle-même. Les erreurs sont
loggées pour audit.
"""

from __future__ import annotations

import logging
from datetime import datetime, UTC
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_templates import render_and_send_email
from app.core.pdf_templates import generate_qr_base64, render_pdf
from app.core.storage_service import store_file
from app.models.common import (
    Attachment,
    Entity,
    User,
    UserDelegation,
)

logger = logging.getLogger(__name__)


def _fmt_date(dt: datetime | None) -> str:
    if not dt:
        return "—"
    return dt.strftime("%d/%m/%Y")


def _fmt_datetime(dt: datetime | None) -> str:
    if not dt:
        return "—"
    return dt.strftime("%d/%m/%Y %H:%M UTC")


async def _build_pdf_variables(
    delegation: UserDelegation,
    delegator: User,
    delegate: User,
    entity: Entity | None,
    status_label: str = "ACTIVE",
) -> dict:
    """Build the variables dict consumed by the delegation.certificate PDF template."""
    duration_days = None
    if delegation.start_date and delegation.end_date:
        try:
            duration_days = (delegation.end_date - delegation.start_date).days
        except Exception:
            duration_days = None

    return {
        "delegation_id": str(delegation.id),
        "delegator": {
            "full_name": f"{delegator.first_name or ''} {delegator.last_name or ''}".strip() or delegator.email,
            "email": delegator.email or "—",
            "position": getattr(delegator, "job_title", None) or getattr(delegator, "position", None),
        },
        "delegate": {
            "full_name": f"{delegate.first_name or ''} {delegate.last_name or ''}".strip() or delegate.email,
            "email": delegate.email or "—",
            "position": getattr(delegate, "job_title", None) or getattr(delegate, "position", None),
        },
        "start_date": _fmt_date(delegation.start_date),
        "end_date": _fmt_date(delegation.end_date),
        "duration_days": duration_days,
        "permissions_count": len(delegation.permissions or []),
        "permissions_list": delegation.permissions or [],
        "reason": delegation.reason,
        "status_label": status_label,
        "entity": {
            "name": entity.name if entity else "OpsFlux",
            "code": entity.code if entity else None,
        },
        "generated_at": _fmt_datetime(datetime.now(UTC)),
        "qr_data_url": f"data:image/png;base64,{generate_qr_base64(str(delegation.id))}",
    }


async def _generate_and_store_pdf(
    db: AsyncSession,
    delegation: UserDelegation,
    delegator: User,
    delegate: User,
    entity: Entity | None,
    *,
    status_label: str = "ACTIVE",
) -> Attachment | None:
    """Generate the ISO traceability PDF and store it as an attachment.

    Returns the created Attachment or None on failure.
    """
    try:
        variables = await _build_pdf_variables(
            delegation, delegator, delegate, entity, status_label=status_label,
        )
        pdf_bytes = await render_pdf(
            db,
            slug="delegation.certificate",
            entity_id=delegation.entity_id,
            language="fr",  # Always FR for the canonical archived copy
            variables=variables,
        )
        if not pdf_bytes:
            logger.warning(
                "PDF generation returned None for delegation %s",
                delegation.id,
            )
            return None

        # Store via storage service (owner_type=delegation, owner_id=delegation.id)
        original_filename = f"delegation-certificate-{delegation.id}.pdf"
        storage_path, unique_name = await store_file(
            content=pdf_bytes,
            owner_type="delegation",
            owner_id=str(delegation.id),
            original_filename=original_filename,
            content_type="application/pdf",
        )

        attachment = Attachment(
            owner_type="delegation",
            owner_id=delegation.id,
            filename=unique_name,
            original_name=original_filename,
            content_type="application/pdf",
            size_bytes=len(pdf_bytes),
            storage_path=storage_path,
            description=f"Certificat de traçabilité ISO — délégation {delegation.id} ({status_label})",
            category="iso_traceability",
            uploaded_by=delegator.id,
            entity_id=delegation.entity_id,
        )
        db.add(attachment)
        await db.flush()
        await db.refresh(attachment)
        logger.info(
            "PDF traceability generated for delegation %s (attachment=%s)",
            delegation.id,
            attachment.id,
        )
        return attachment
    except Exception:
        # Best-effort : never fail the delegation flow because of a PDF/storage hiccup.
        logger.exception(
            "Failed to generate ISO traceability PDF for delegation %s",
            delegation.id,
        )
        return None


def _pdf_download_url(attachment_id: UUID | None) -> str | None:
    if not attachment_id:
        return None
    # Frontend route — the actual SPA resolves this to a deep link.
    # The download endpoint is /api/v1/attachments/{id}/download.
    return f"/api/v1/attachments/{attachment_id}/download"


async def _send_delegation_emails(
    db: AsyncSession,
    *,
    delegation: UserDelegation,
    delegator: User,
    delegate: User,
    entity: Entity | None,
    pdf_attachment: Attachment | None,
) -> None:
    """Send the 2 notification emails (delegator + delegate)."""
    base_vars: dict = {
        "delegator": {
            "full_name": f"{delegator.first_name or ''} {delegator.last_name or ''}".strip() or delegator.email,
            "email": delegator.email,
        },
        "delegate": {
            "full_name": f"{delegate.first_name or ''} {delegate.last_name or ''}".strip() or delegate.email,
            "email": delegate.email,
        },
        "start_date": _fmt_date(delegation.start_date),
        "end_date": _fmt_date(delegation.end_date),
        "permissions_count": len(delegation.permissions or []),
        "permissions_list": delegation.permissions or [],
        "reason": delegation.reason,
        "entity": {"name": entity.name if entity else "OpsFlux"},
        "delegation_id": str(delegation.id),
        "pdf_url": _pdf_download_url(pdf_attachment.id if pdf_attachment else None),
    }

    # Email 1 — delegator (confirmation "you granted a delegation")
    try:
        await render_and_send_email(
            db,
            slug="delegation_granted",
            entity_id=delegation.entity_id,
            to=delegator.email,
            variables=base_vars,
            user_id=delegator.id,
            event_type="delegation_granted",
        )
    except Exception:
        logger.exception(
            "Failed to send delegation_granted email for delegation %s",
            delegation.id,
        )

    # Email 2 — delegate (notification "you received a delegation")
    if delegate.email:
        try:
            await render_and_send_email(
                db,
                slug="delegation_received",
                entity_id=delegation.entity_id,
                to=delegate.email,
                variables=base_vars,
                user_id=delegate.id,
                event_type="delegation_received",
            )
        except Exception:
            logger.exception(
                "Failed to send delegation_received email for delegation %s",
                delegation.id,
            )


async def notify_delegation_created(
    db: AsyncSession,
    *,
    delegation: UserDelegation,
    delegator: User,
    delegate: User,
) -> None:
    """Trigger ISO traceability flow for a newly created delegation.

    Steps:
      1. Generate + archive PDF certificate
      2. Send email to delegator
      3. Send email to delegate
    """
    entity = None
    if delegation.entity_id:
        try:
            entity_row = await db.execute(
                select(Entity).where(Entity.id == delegation.entity_id)
            )
            entity = entity_row.scalar_one_or_none()
        except Exception:
            logger.exception("Failed to load entity for delegation %s", delegation.id)

    pdf_attachment = await _generate_and_store_pdf(
        db, delegation, delegator, delegate, entity, status_label="ACTIVE",
    )
    await _send_delegation_emails(
        db,
        delegation=delegation,
        delegator=delegator,
        delegate=delegate,
        entity=entity,
        pdf_attachment=pdf_attachment,
    )


async def notify_delegation_revoked(
    db: AsyncSession,
    *,
    delegation: UserDelegation,
    delegator: User,
    delegate: User,
) -> None:
    """Send revocation email + regenerate a "REVOKED" PDF certificate for the audit trail.

    The original "ACTIVE" PDF is kept (immutable) — we add a new attachment
    flagged as REVOKED so the audit history shows both states.
    """
    entity = None
    if delegation.entity_id:
        try:
            entity_row = await db.execute(
                select(Entity).where(Entity.id == delegation.entity_id)
            )
            entity = entity_row.scalar_one_or_none()
        except Exception:
            logger.exception("Failed to load entity for delegation %s", delegation.id)

    # New PDF with REVOKED status (the original ACTIVE PDF stays in attachments
    # for full ISO traceability — never deleted).
    await _generate_and_store_pdf(
        db, delegation, delegator, delegate, entity, status_label="REVOKED",
    )

    # Notify delegate only — delegator triggered the revocation himself.
    if delegate.email:
        try:
            await render_and_send_email(
                db,
                slug="delegation_revoked",
                entity_id=delegation.entity_id,
                to=delegate.email,
                variables={
                    "delegator": {
                        "full_name": f"{delegator.first_name or ''} {delegator.last_name or ''}".strip() or delegator.email,
                    },
                    "delegate": {
                        "full_name": f"{delegate.first_name or ''} {delegate.last_name or ''}".strip() or delegate.email,
                    },
                    "revoked_at": _fmt_datetime(datetime.now(UTC)),
                    "entity": {"name": entity.name if entity else "OpsFlux"},
                    "delegation_id": str(delegation.id),
                },
                user_id=delegate.id,
                event_type="delegation_revoked",
            )
        except Exception:
            logger.exception(
                "Failed to send delegation_revoked email for delegation %s",
                delegation.id,
            )

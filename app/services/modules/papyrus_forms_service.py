"""Papyrus forms and external submission services."""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.papyrus import PapyrusExternalLink, PapyrusExternalSubmission, PapyrusForm


EPICOLLECT_TO_PAPYRUS_FIELD_TYPES: dict[str, str] = {
    "text": "input_text",
    "numeric": "input_number",
    "date": "input_date",
    "photo": "input_file",
    "location": "input_gps",
    "dropdown": "input_select",
    "checkbox": "input_multiselect",
    "branch": "input_condition",
}

PAPYRUS_TO_EPICOLLECT_FIELD_TYPES: dict[str, str] = {
    "input_text": "text",
    "input_number": "numeric",
    "input_date": "date",
    "input_file": "photo",
    "input_gps": "location",
    "input_select": "dropdown",
    "input_multiselect": "checkbox",
    "input_condition": "branch",
    "text": "text",
    "number": "numeric",
    "date": "date",
    "file": "photo",
    "gps": "location",
    "select": "dropdown",
    "multiselect": "checkbox",
    "condition": "branch",
}


async def list_forms(
    *,
    entity_id: UUID,
    db: AsyncSession,
) -> list[PapyrusForm]:
    result = await db.execute(
        select(PapyrusForm)
        .where(PapyrusForm.entity_id == entity_id)
        .order_by(PapyrusForm.created_at.desc())
    )
    return list(result.scalars().all())


async def get_form(
    *,
    form_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> PapyrusForm:
    result = await db.execute(
        select(PapyrusForm).where(
            PapyrusForm.id == form_id,
            PapyrusForm.entity_id == entity_id,
        )
    )
    form = result.scalar_one_or_none()
    if not form:
        from fastapi import HTTPException
        raise HTTPException(404, "Papyrus form not found")
    return form


async def create_form(
    *,
    entity_id: UUID,
    created_by: UUID,
    body: Any,
    db: AsyncSession,
) -> PapyrusForm:
    form = PapyrusForm(
        entity_id=entity_id,
        document_id=getattr(body, "document_id", None),
        doc_type_id=getattr(body, "doc_type_id", None),
        name=body.name,
        description=getattr(body, "description", None),
        schema_json=getattr(body, "form_schema", {}) or {},
        settings_json=getattr(body, "settings_json", {}) or {},
        created_by=created_by,
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)
    return form


async def import_epicollect_form(
    *,
    entity_id: UUID,
    created_by: UUID,
    body: Any,
    db: AsyncSession,
) -> PapyrusForm:
    project = getattr(body, "project", {}) or {}
    schema_json = _convert_epicollect_project_to_papyrus_schema(project)
    return await create_form(
        entity_id=entity_id,
        created_by=created_by,
        body=type(
            "PapyrusImportedForm",
            (),
            {
                "document_id": getattr(body, "document_id", None),
                "doc_type_id": getattr(body, "doc_type_id", None),
                "name": body.name,
                "description": getattr(body, "description", None),
                "form_schema": schema_json,
                "settings_json": {
                    "source": "epicollect5",
                    "epicollect_project": {
                        "name": project.get("name"),
                        "id": project.get("id"),
                    },
                },
            },
        )(),
        db=db,
    )


async def export_epicollect_form(
    *,
    form_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    form = await get_form(form_id=form_id, entity_id=entity_id, db=db)
    return {
        "project": {
            "name": form.name,
            "description": form.description,
            "id": str(form.id),
            "created_at": form.created_at.isoformat() if form.created_at else None,
            "forms": [
                {
                    "name": _slugify(form.name or f"form-{form.id}"),
                    "title": form.name,
                    "fields": [
                        _convert_papyrus_field_to_epicollect(field)
                        for field in (form.schema_json or {}).get("fields", [])
                        if isinstance(field, dict)
                    ],
                }
            ],
        }
    }


async def update_form(
    *,
    form_id: UUID,
    entity_id: UUID,
    body: Any,
    db: AsyncSession,
) -> PapyrusForm:
    form = await get_form(form_id=form_id, entity_id=entity_id, db=db)
    update_data = body.model_dump(exclude_unset=True, by_alias=False)
    if "form_schema" in update_data:
        update_data["schema_json"] = update_data.pop("form_schema")
    for key, value in update_data.items():
        setattr(form, key, value)
    await db.commit()
    await db.refresh(form)
    return form


async def list_submissions(
    *,
    form_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> list[PapyrusExternalSubmission]:
    await get_form(form_id=form_id, entity_id=entity_id, db=db)
    result = await db.execute(
        select(PapyrusExternalSubmission)
        .where(
            PapyrusExternalSubmission.entity_id == entity_id,
            PapyrusExternalSubmission.form_id == form_id,
        )
        .order_by(PapyrusExternalSubmission.submitted_at.desc())
    )
    return list(result.scalars().all())


async def create_external_link(
    *,
    form_id: UUID,
    entity_id: UUID,
    created_by: UUID,
    body: Any,
    db: AsyncSession,
) -> dict[str, Any]:
    form = await get_form(form_id=form_id, entity_id=entity_id, db=db)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=int(body.expires_in_hours))
    token_id = uuid4().hex
    link = PapyrusExternalLink(
        entity_id=entity_id,
        form_id=form.id,
        token_id=token_id,
        expires_at=expires_at,
        max_submissions=getattr(body, "max_submissions", None),
        submission_count=0,
        prefill=getattr(body, "prefill", None),
        allowed_ips=getattr(body, "allowed_ips", None),
        require_identity=getattr(body, "require_identity", False),
        created_by=created_by,
    )
    db.add(link)
    await db.flush()

    token = jwt.encode(
        {
            "sub": "papyrus_external_form",
            "tid": token_id,
            "fid": str(form.id),
            "eid": str(entity_id),
            "exp": int(expires_at.timestamp()),
            "max_submissions": getattr(body, "max_submissions", None),
            "prefill": getattr(body, "prefill", None),
            "allowed_ips": getattr(body, "allowed_ips", None),
            "require_identity": getattr(body, "require_identity", False),
            "created_by": str(created_by),
        },
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    await db.commit()
    await db.refresh(link)
    return {
        "id": link.id,
        "form_id": link.form_id,
        "token_id": link.token_id,
        "expires_at": link.expires_at,
        "max_submissions": link.max_submissions,
        "submission_count": link.submission_count,
        "prefill": link.prefill,
        "allowed_ips": link.allowed_ips,
        "require_identity": link.require_identity,
        "is_revoked": link.is_revoked,
        "created_at": link.created_at,
        "external_url": f"{settings.external_paxlog_url}/f/{form.id}?token={token}",
    }


async def revoke_external_link(
    *,
    form_id: UUID,
    token_id: str,
    entity_id: UUID,
    db: AsyncSession,
) -> dict[str, str]:
    await get_form(form_id=form_id, entity_id=entity_id, db=db)
    result = await db.execute(
        select(PapyrusExternalLink).where(
            PapyrusExternalLink.form_id == form_id,
            PapyrusExternalLink.entity_id == entity_id,
            PapyrusExternalLink.token_id == token_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        from fastapi import HTTPException
        raise HTTPException(404, "Papyrus external link not found")
    link.is_revoked = True
    await db.commit()
    return {"status": "revoked", "token_id": token_id}


async def consume_external_form(
    *,
    form_id: UUID,
    token: str,
    request_ip: str | None,
    db: AsyncSession,
) -> dict[str, Any]:
    payload = _decode_external_token(token)
    if payload.get("fid") != str(form_id):
        from fastapi import HTTPException
        raise HTTPException(403, "Token does not match this form")

    result = await db.execute(
        select(PapyrusExternalLink).where(
            PapyrusExternalLink.form_id == form_id,
            PapyrusExternalLink.token_id == payload.get("tid"),
        )
    )
    link = result.scalar_one_or_none()
    if not link or link.is_revoked:
        from fastapi import HTTPException
        raise HTTPException(410, "External link is invalid or revoked")

    if link.allowed_ips and request_ip and request_ip not in link.allowed_ips:
        from fastapi import HTTPException
        raise HTTPException(403, "IP address is not allowed for this link")

    if link.max_submissions is not None and link.submission_count >= link.max_submissions:
        from fastapi import HTTPException
        raise HTTPException(410, "Submission quota reached")

    form = await db.get(PapyrusForm, form_id)
    if not form or not form.is_active:
        from fastapi import HTTPException
        raise HTTPException(404, "Papyrus form not found or inactive")

    return {
        "form": form,
        "link": link,
        "prefill": payload.get("prefill") or link.prefill or {},
        "require_identity": bool(payload.get("require_identity") or link.require_identity),
    }


async def submit_external_form(
    *,
    form_id: UUID,
    token: str,
    request_ip: str | None,
    body: Any,
    db: AsyncSession,
) -> PapyrusExternalSubmission:
    consumed = await consume_external_form(form_id=form_id, token=token, request_ip=request_ip, db=db)
    form: PapyrusForm = consumed["form"]
    link: PapyrusExternalLink = consumed["link"]

    submission = PapyrusExternalSubmission(
        entity_id=form.entity_id,
        form_id=form.id,
        token_id=link.token_id,
        respondent=getattr(body, "respondent", None),
        answers=getattr(body, "answers", {}) or {},
        ip_address=request_ip,
        status="pending",
    )
    db.add(submission)
    link.submission_count += 1
    await db.commit()
    await db.refresh(submission)
    return submission


def _decode_external_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        from fastapi import HTTPException
        raise HTTPException(403, "Invalid or expired Papyrus external token") from exc


def _convert_epicollect_project_to_papyrus_schema(project: dict[str, Any]) -> dict[str, Any]:
    forms = project.get("forms")
    if not isinstance(forms, list):
        forms = []

    fields: list[dict[str, Any]] = []
    for form in forms:
        if not isinstance(form, dict):
            continue
        for field in form.get("fields", []) or []:
            if not isinstance(field, dict):
                continue
            papyrus_type = EPICOLLECT_TO_PAPYRUS_FIELD_TYPES.get(str(field.get("type") or "").lower(), "input_text")
            mapped = {
                "id": field.get("ref") or field.get("name") or uuid4().hex,
                "type": papyrus_type,
                "label": field.get("label") or field.get("title") or field.get("ref") or "Field",
                "required": bool(field.get("required", False)),
            }
            if "options" in field and isinstance(field["options"], list):
                mapped["options"] = [
                    {"label": str(option), "value": str(option)}
                    for option in field["options"]
                ]
            if field.get("branch") is not None:
                mapped["condition"] = field.get("branch")
            fields.append(mapped)

    return {
        "version": 1,
        "source": "epicollect5",
        "fields": fields,
    }


def _convert_papyrus_field_to_epicollect(field: dict[str, Any]) -> dict[str, Any]:
    field_type = str(field.get("type") or "input_text")
    epicollect_type = PAPYRUS_TO_EPICOLLECT_FIELD_TYPES.get(field_type, "text")
    exported = {
        "ref": field.get("id") or uuid4().hex,
        "type": epicollect_type,
        "label": field.get("label") or field.get("id") or "Field",
        "required": bool(field.get("required", False)),
    }
    options = field.get("options")
    if isinstance(options, list):
        exported["options"] = [
            option.get("value", option.get("label"))
            if isinstance(option, dict)
            else option
            for option in options
        ]
    if field.get("condition") is not None:
        exported["branch"] = field.get("condition")
    return exported


def _slugify(value: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else "_" for ch in value.strip())
    compact = "_".join(part for part in normalized.split("_") if part)
    return compact or "papyrus_form"

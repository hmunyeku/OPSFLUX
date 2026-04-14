"""i18n routes — server-driven translations catalog.

Public endpoints (any authenticated user):
  - GET /api/v1/i18n/languages           List active languages
  - GET /api/v1/i18n/catalog             Full catalog for one language

Admin endpoints (permission: core.settings.manage):
  - GET    /api/v1/i18n/admin/messages        Paginated list with filters
  - POST   /api/v1/i18n/admin/messages        Upsert one message
  - PATCH  /api/v1/i18n/admin/messages/{id}   Update one message
  - DELETE /api/v1/i18n/admin/messages/{id}   Delete
  - POST   /api/v1/i18n/admin/bulk-upsert     Bulk upsert (migration / import)
  - POST   /api/v1/i18n/admin/languages       Create a language
  - PATCH  /api/v1/i18n/admin/languages/{code}
  - DELETE /api/v1/i18n/admin/languages/{code}

Hash strategy:
  - Computed as SHA-256 of the sorted `key=value\n` lines for a given
    (language_code, namespace).
  - Recomputed after any mutation (single or bulk).
  - Clients send `If-None-Match: <hash>`; server replies 304 if match.
"""

from __future__ import annotations

import hashlib
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.common import (
    I18nCatalogMeta,
    I18nLanguage,
    I18nMessage,
    User,
)
from app.schemas.common import (
    I18nBulkUpsertRequest,
    I18nCatalogMetaRead,
    I18nCatalogResponse,
    I18nLanguageCreate,
    I18nLanguageRead,
    I18nLanguageUpdate,
    I18nMessageRead,
    I18nMessageUpdate,
    I18nMessageUpsert,
)

router = APIRouter(prefix="/api/v1/i18n", tags=["i18n"])


# ── Helpers ────────────────────────────────────────────────────────────

async def _recompute_hash(
    db: AsyncSession,
    language_code: str,
    namespace: str = "mobile",
) -> str:
    """Recompute and persist the catalog hash for (language, namespace)."""
    query = (
        select(I18nMessage.key, I18nMessage.value)
        .where(I18nMessage.language_code == language_code)
        .where(I18nMessage.namespace == namespace)
        .order_by(I18nMessage.key)
    )
    rows = (await db.execute(query)).all()
    payload = "\n".join(f"{k}={v}" for k, v in rows).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()

    # Upsert catalog_meta
    stmt = pg_insert(I18nCatalogMeta).values(
        language_code=language_code,
        namespace=namespace,
        hash=digest,
        message_count=len(rows),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["language_code", "namespace"],
        set_={
            "hash": stmt.excluded.hash,
            "message_count": stmt.excluded.message_count,
        },
    )
    await db.execute(stmt)
    return digest


# ── Public endpoints ──────────────────────────────────────────────────

@router.get("/languages", response_model=list[I18nLanguageRead])
async def list_languages(
    active_only: bool = Query(True, description="Only active languages"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List languages available for translation selection."""
    query = select(I18nLanguage).order_by(I18nLanguage.sort_order, I18nLanguage.code)
    if active_only:
        query = query.where(I18nLanguage.active.is_(True))
    return (await db.execute(query)).scalars().all()


@router.get("/catalog", response_model=I18nCatalogResponse)
async def get_catalog(
    response: Response,
    lang: str = Query("fr", description="Language code, e.g. 'fr'"),
    namespace: str = Query("mobile", description="Catalog namespace"),
    if_none_match: str | None = Query(None, alias="if_none_match"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the full message catalog for one language/namespace.

    Clients can pass `if_none_match=<hash>` to get 304 when nothing changed
    (saves bandwidth on app cold-start).
    """
    # Check language exists & active
    lang_row = (
        await db.execute(select(I18nLanguage).where(I18nLanguage.code == lang))
    ).scalar_one_or_none()
    if not lang_row or not lang_row.active:
        raise HTTPException(status_code=404, detail=f"Language '{lang}' not available")

    # Compare hash for conditional response
    meta = (
        await db.execute(
            select(I18nCatalogMeta)
            .where(I18nCatalogMeta.language_code == lang)
            .where(I18nCatalogMeta.namespace == namespace)
        )
    ).scalar_one_or_none()

    current_hash = meta.hash if meta else ""
    if if_none_match and current_hash and if_none_match == current_hash:
        response.status_code = status.HTTP_304_NOT_MODIFIED
        return I18nCatalogResponse(
            language=lang, namespace=namespace, hash=current_hash, messages={}, count=0
        )

    # Fetch all messages
    rows = (
        await db.execute(
            select(I18nMessage.key, I18nMessage.value)
            .where(I18nMessage.language_code == lang)
            .where(I18nMessage.namespace == namespace)
        )
    ).all()
    messages = {k: v for k, v in rows}

    # If no meta yet, compute it on the fly
    if not current_hash:
        current_hash = await _recompute_hash(db, lang, namespace)
        await db.commit()

    response.headers["ETag"] = current_hash
    return I18nCatalogResponse(
        language=lang,
        namespace=namespace,
        hash=current_hash,
        messages=messages,
        count=len(messages),
    )


# ── Admin endpoints ───────────────────────────────────────────────────

@router.get(
    "/admin/messages",
    response_model=list[I18nMessageRead],
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_list_messages(
    language_code: str | None = Query(None),
    namespace: str = Query("mobile"),
    key_prefix: str | None = Query(None, description="Filter by key prefix"),
    search: str | None = Query(None, description="Search in value"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated admin view of messages."""
    query = (
        select(I18nMessage)
        .where(I18nMessage.namespace == namespace)
        .order_by(I18nMessage.key, I18nMessage.language_code)
    )
    if language_code:
        query = query.where(I18nMessage.language_code == language_code)
    if key_prefix:
        query = query.where(I18nMessage.key.like(f"{key_prefix}%"))
    if search:
        query = query.where(I18nMessage.value.ilike(f"%{search}%"))
    query = query.limit(limit).offset(offset)
    return (await db.execute(query)).scalars().all()


@router.post(
    "/admin/messages",
    response_model=I18nMessageRead,
    status_code=201,
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_upsert_message(
    body: I18nMessageUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a single message."""
    # Verify language exists
    lang_exists = (
        await db.execute(
            select(I18nLanguage).where(I18nLanguage.code == body.language_code)
        )
    ).scalar_one_or_none()
    if not lang_exists:
        raise HTTPException(status_code=400, detail=f"Language '{body.language_code}' does not exist")

    stmt = pg_insert(I18nMessage).values(
        key=body.key,
        language_code=body.language_code,
        namespace=body.namespace,
        value=body.value,
        notes=body.notes,
        updated_by=current_user.id,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["key", "language_code"],
        set_={
            "value": stmt.excluded.value,
            "notes": stmt.excluded.notes,
            "updated_by": current_user.id,
        },
    ).returning(I18nMessage)
    row = (await db.execute(stmt)).scalar_one()

    await _recompute_hash(db, body.language_code, body.namespace)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch(
    "/admin/messages/{message_id}",
    response_model=I18nMessageRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_update_message(
    message_id: UUID,
    body: I18nMessageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    msg = (
        await db.execute(select(I18nMessage).where(I18nMessage.id == message_id))
    ).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    for k, v in update.items():
        setattr(msg, k, v)
    msg.updated_by = current_user.id

    await _recompute_hash(db, msg.language_code, msg.namespace)
    await db.commit()
    await db.refresh(msg)
    return msg


@router.delete(
    "/admin/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_delete_message(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    msg = (
        await db.execute(select(I18nMessage).where(I18nMessage.id == message_id))
    ).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    lang_code, ns = msg.language_code, msg.namespace
    await db.delete(msg)
    await _recompute_hash(db, lang_code, ns)
    await db.commit()


@router.post(
    "/admin/bulk-upsert",
    response_model=I18nCatalogMetaRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_bulk_upsert(
    body: I18nBulkUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk upsert — used by migration scripts or CSV import."""
    # Verify language
    lang_exists = (
        await db.execute(
            select(I18nLanguage).where(I18nLanguage.code == body.language_code)
        )
    ).scalar_one_or_none()
    if not lang_exists:
        raise HTTPException(status_code=400, detail=f"Language '{body.language_code}' does not exist")

    if body.replace:
        # Delete keys not present in the incoming payload
        incoming_keys = {m.key for m in body.messages}
        existing = (
            await db.execute(
                select(I18nMessage.id, I18nMessage.key)
                .where(I18nMessage.language_code == body.language_code)
                .where(I18nMessage.namespace == body.namespace)
            )
        ).all()
        to_delete = [r.id for r in existing if r.key not in incoming_keys]
        if to_delete:
            await db.execute(delete(I18nMessage).where(I18nMessage.id.in_(to_delete)))

    # Upsert each message
    for item in body.messages:
        stmt = pg_insert(I18nMessage).values(
            key=item.key,
            language_code=body.language_code,
            namespace=body.namespace,
            value=item.value,
            notes=item.notes,
            updated_by=current_user.id,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["key", "language_code"],
            set_={
                "value": stmt.excluded.value,
                "notes": stmt.excluded.notes,
                "updated_by": current_user.id,
            },
        )
        await db.execute(stmt)

    await _recompute_hash(db, body.language_code, body.namespace)
    await db.commit()

    meta = (
        await db.execute(
            select(I18nCatalogMeta)
            .where(I18nCatalogMeta.language_code == body.language_code)
            .where(I18nCatalogMeta.namespace == body.namespace)
        )
    ).scalar_one()
    return meta


# ── Language admin ────────────────────────────────────────────────────

@router.post(
    "/admin/languages",
    response_model=I18nLanguageRead,
    status_code=201,
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_create_language(
    body: I18nLanguageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exists = (
        await db.execute(select(I18nLanguage).where(I18nLanguage.code == body.code))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail=f"Language '{body.code}' already exists")
    lang = I18nLanguage(**body.model_dump())
    db.add(lang)
    await db.commit()
    await db.refresh(lang)
    return lang


@router.patch(
    "/admin/languages/{code}",
    response_model=I18nLanguageRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_update_language(
    code: str,
    body: I18nLanguageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = (
        await db.execute(select(I18nLanguage).where(I18nLanguage.code == code))
    ).scalar_one_or_none()
    if not lang:
        raise HTTPException(status_code=404, detail="Language not found")
    update = body.model_dump(exclude_unset=True)
    for k, v in update.items():
        setattr(lang, k, v)
    await db.commit()
    await db.refresh(lang)
    return lang


@router.delete(
    "/admin/languages/{code}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_delete_language(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = (
        await db.execute(select(I18nLanguage).where(I18nLanguage.code == code))
    ).scalar_one_or_none()
    if not lang:
        raise HTTPException(status_code=404, detail="Language not found")
    await db.delete(lang)
    await db.commit()


# ── AI Translation ───────────────────────────────────────────────────


@router.post(
    "/admin/ai-translate",
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_ai_translate(
    source_lang: str = Query("fr", description="Source language code"),
    target_lang: str = Query(..., description="Target language code"),
    namespace: str = Query("app", description="Namespace"),
    key_prefix: str | None = Query(None, description="Only translate keys starting with this prefix"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Use AI to translate missing keys from source to target language.

    Only translates keys that exist in source but are missing in target.
    Never overwrites existing translations.
    """
    from app.core.ai_config import get_ai_config
    from app.api.routes.core.ai_chat import _normalize_model_config
    import litellm

    # Get source messages
    source_query = (
        select(I18nMessage.key, I18nMessage.value)
        .where(I18nMessage.language_code == source_lang)
        .where(I18nMessage.namespace == namespace)
    )
    if key_prefix:
        source_query = source_query.where(I18nMessage.key.like(f"{key_prefix}%"))
    source_rows = (await db.execute(source_query)).all()
    source_map = {k: v for k, v in source_rows}

    # Get existing target keys
    target_keys = set(
        row[0]
        for row in (
            await db.execute(
                select(I18nMessage.key)
                .where(I18nMessage.language_code == target_lang)
                .where(I18nMessage.namespace == namespace)
            )
        ).all()
    )

    # Find missing keys
    missing = {k: v for k, v in source_map.items() if k not in target_keys}
    if not missing:
        return {"translated": 0, "message": "All keys already exist in target language"}

    # Get language labels for the prompt
    target_lang_row = (
        await db.execute(select(I18nLanguage).where(I18nLanguage.code == target_lang))
    ).scalar_one_or_none()
    if not target_lang_row:
        raise HTTPException(400, f"Target language '{target_lang}' not found")

    target_label = target_lang_row.english_label or target_lang

    # Batch translate (max 50 keys per AI call to avoid token limits)
    translated_count = 0
    items = list(missing.items())

    for batch_start in range(0, len(items), 50):
        batch = items[batch_start:batch_start + 50]
        lines = "\n".join(f"{k} = {v}" for k, v in batch)

        prompt = (
            f"You are translating UI labels for OpsFlux, a professional ERP platform "
            f"for Oil & Gas operations. Translate from French to {target_label}.\n\n"
            f"CRITICAL RULES:\n"
            f"- Keep the exact same keys (before =). Only translate the values (after =).\n"
            f"- PRESERVE all interpolation variables exactly as-is: {{{{count}}}}, {{{{name}}}}, {{{{0}}}}, etc.\n"
            f"- PRESERVE all HTML tags: <strong>, <br/>, <a>, etc.\n"
            f"- Maintain the same tone: formal/professional for business labels, friendly for user messages.\n"
            f"- Keep technical terms (API, PDF, CSV, RBAC, PAX, POB, AdS) untranslated.\n"
            f"- Keep brand names (OpsFlux, TravelWiz, PaxLog, PackLog, Planner) untranslated.\n"
            f"- Use standard industry terminology for the target language.\n"
            f"- Return ONLY the translated lines in the same format 'key = value', nothing else.\n\n"
            f"{lines}"
        )

        try:
            ai_cfg = await get_ai_config()
            _, llm_kwargs = _normalize_model_config(ai_cfg)
            resp = await litellm.acompletion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
                **llm_kwargs,
            )
            result = resp.choices[0].message.content or ""
        except Exception:
            continue

        # Parse AI response
        for line in result.strip().split("\n"):
            line = line.strip()
            if " = " not in line:
                continue
            key, _, value = line.partition(" = ")
            key = key.strip()
            value = value.strip()
            if key in missing and value:
                stmt = pg_insert(I18nMessage).values(
                    key=key,
                    language_code=target_lang,
                    namespace=namespace,
                    value=value,
                    notes=f"AI-translated from {source_lang}",
                    updated_by=current_user.id,
                )
                stmt = stmt.on_conflict_do_nothing(index_elements=["key", "language_code"])
                await db.execute(stmt)
                translated_count += 1

    await _recompute_hash(db, target_lang, namespace)
    await db.commit()

    return {"translated": translated_count, "total_missing": len(missing)}

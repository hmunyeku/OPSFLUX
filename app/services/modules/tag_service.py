"""Tag Registry — business logic service.

Manages DCS tags (Rockwell), naming rules, suggestions (AI-assisted),
validation, CSV import, and bulk rename operations.
"""

import csv
import io
import logging
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import cast

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Tag CRUD
# ═══════════════════════════════════════════════════════════════════════════════


async def list_tags(
    *,
    entity_id: UUID,
    project_id: str | None = None,
    search: str | None = None,
    tag_type: str | None = None,
    area: str | None = None,
    equipment_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession,
) -> dict[str, Any]:
    """List DCS tags with filtering and pagination."""
    from app.models.pid_pfd import DCSTag

    query = select(DCSTag).where(
        DCSTag.entity_id == entity_id,
        DCSTag.is_active == True,  # noqa: E712
    )

    if project_id:
        query = query.where(DCSTag.project_id == UUID(project_id))
    if search:
        query = query.where(
            or_(
                DCSTag.tag_name.ilike(f"%{search}%"),
                DCSTag.description.ilike(f"%{search}%"),
            )
        )
    if tag_type:
        query = query.where(DCSTag.tag_type == tag_type)
    if area:
        query = query.where(DCSTag.area == area)
    if equipment_id:
        query = query.where(DCSTag.equipment_id == UUID(equipment_id))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(DCSTag.tag_name).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    tags = result.scalars().all()

    return {
        "items": tags,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


async def create_tag(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new DCS tag."""
    from app.models.pid_pfd import DCSTag

    tag = DCSTag(
        entity_id=entity_id,
        project_id=body.project_id,
        tag_name=body.tag_name.upper().strip(),
        description=getattr(body, "description", None),
        tag_type=body.tag_type,
        area=getattr(body, "area", None),
        equipment_id=getattr(body, "equipment_id", None),
        pid_document_id=getattr(body, "pid_document_id", None),
        dcs_address=getattr(body, "dcs_address", None),
        range_min=getattr(body, "range_min", None),
        range_max=getattr(body, "range_max", None),
        engineering_unit=getattr(body, "engineering_unit", None),
        alarm_lo=getattr(body, "alarm_lo", None),
        alarm_hi=getattr(body, "alarm_hi", None),
        trip_lo=getattr(body, "trip_lo", None),
        trip_hi=getattr(body, "trip_hi", None),
        source="manual",
        created_by=created_by,
    )
    db.add(tag)
    await db.commit()
    return tag


async def update_tag(
    *,
    tag_id: str | UUID,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update a DCS tag."""
    from app.models.pid_pfd import DCSTag

    result = await db.execute(
        select(DCSTag).where(
            DCSTag.id == UUID(str(tag_id)),
            DCSTag.entity_id == entity_id,
        )
    )
    tag = result.scalar_one_or_none()
    if not tag:
        from fastapi import HTTPException

        raise HTTPException(404, f"DCS tag {tag_id} not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(tag, key):
            setattr(tag, key, value)

    tag.updated_at = datetime.now(UTC)
    await db.commit()
    return tag


async def delete_tag(
    *,
    tag_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Soft-delete a DCS tag (set is_active=False)."""
    from app.models.pid_pfd import DCSTag

    result = await db.execute(
        select(DCSTag).where(
            DCSTag.id == UUID(str(tag_id)),
            DCSTag.entity_id == entity_id,
        )
    )
    tag = result.scalar_one_or_none()
    if not tag:
        from fastapi import HTTPException

        raise HTTPException(404, f"DCS tag {tag_id} not found")

    tag.is_active = False
    tag.updated_at = datetime.now(UTC)
    await db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# Tag Naming Rules
# ═══════════════════════════════════════════════════════════════════════════════


async def list_naming_rules(
    *,
    entity_id: UUID,
    db: AsyncSession,
) -> list[Any]:
    """List tag naming rules for the entity."""
    from app.models.pid_pfd import TagNamingRule

    result = await db.execute(
        select(TagNamingRule)
        .where(TagNamingRule.entity_id == entity_id)
        .order_by(TagNamingRule.is_default.desc(), TagNamingRule.name)
    )
    return result.scalars().all()


async def create_naming_rule(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new naming rule."""
    from app.models.pid_pfd import TagNamingRule

    rule = TagNamingRule(
        entity_id=entity_id,
        name=body.name,
        description=getattr(body, "description", None),
        pattern=body.pattern,
        segments=body.segments,
        separator=getattr(body, "separator", "-"),
        applies_to_types=getattr(body, "applies_to_types", []),
        is_default=getattr(body, "is_default", False),
        created_by=created_by,
    )
    db.add(rule)
    await db.commit()
    return rule


async def update_naming_rule(
    *,
    rule_id: str | UUID,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update a naming rule."""
    from app.models.pid_pfd import TagNamingRule

    result = await db.execute(
        select(TagNamingRule).where(
            TagNamingRule.id == UUID(str(rule_id)),
            TagNamingRule.entity_id == entity_id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        from fastapi import HTTPException

        raise HTTPException(404, "Naming rule not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rule, key, value)

    await db.commit()
    return rule


# ═══════════════════════════════════════════════════════════════════════════════
# Tag suggestions (AI-assisted)
# ═══════════════════════════════════════════════════════════════════════════════


async def suggest_tag_name(
    *,
    tag_type: str,
    area: str,
    equipment_id: str | None = None,
    entity_id: UUID,
    project_id: str,
    db: AsyncSession,
) -> list[str]:
    """Generate tag name suggestions based on naming rules + optional AI."""
    from app.models.pid_pfd import TagNamingRule

    # 1. Find applicable rules
    rules_result = await db.execute(
        select(TagNamingRule)
        .where(
            TagNamingRule.entity_id == entity_id,
            or_(
                TagNamingRule.applies_to_types.contains([tag_type]),
                TagNamingRule.applies_to_types == cast("[]", JSONB),
            ),
        )
        .order_by(TagNamingRule.is_default.desc())
    )
    rules = rules_result.scalars().all()

    if not rules:
        # Fallback: simple pattern
        next_seq = await _get_next_tag_sequence(entity_id, project_id, tag_type, area, db)
        return [f"{area}-{tag_type}-{next_seq:03d}"]

    rule = rules[0]

    # 2. Get next sequence
    next_seq = await _get_next_tag_sequence(entity_id, project_id, tag_type, area, db)

    # 3. Generate from pattern
    suggestions = []
    generated = _apply_tag_rule(
        rule,
        {
            "AREA": area,
            "TYPE": tag_type,
            "SEQ": str(next_seq).zfill(_get_seq_digits(rule.pattern)),
        },
    )
    suggestions.append(generated)

    # 4. AI suggestions (if enabled)
    # Placeholder — would use core_ai_service.complete() in production
    # For now, generate alternative sequences
    alt_seq = next_seq + 1
    alt_generated = _apply_tag_rule(
        rule,
        {
            "AREA": area,
            "TYPE": tag_type,
            "SEQ": str(alt_seq).zfill(_get_seq_digits(rule.pattern)),
        },
    )
    suggestions.append(alt_generated)

    return suggestions[:3]


# ═══════════════════════════════════════════════════════════════════════════════
# Tag validation
# ═══════════════════════════════════════════════════════════════════════════════


async def validate_tag_name(
    *,
    tag_name: str,
    tag_type: str,
    entity_id: UUID,
    project_id: str,
    db: AsyncSession,
) -> dict:
    """Validate a tag name for conformity and uniqueness."""
    from app.models.pid_pfd import DCSTag

    errors: list[str] = []
    warnings: list[str] = []

    # 1. Uniqueness check
    existing = await db.execute(
        select(DCSTag).where(
            DCSTag.entity_id == entity_id,
            DCSTag.project_id == UUID(project_id),
            DCSTag.tag_name == tag_name.upper().strip(),
        )
    )
    if existing.scalar_one_or_none():
        errors.append(f"Tag '{tag_name}' already exists in this project")

    # 2. Naming rule conformity
    strict_mode = True  # Default — should come from module settings
    rules = await _get_applicable_rules(tag_type, entity_id, db)

    if rules:
        rule = rules[0]
        conforms = _tag_matches_rule(tag_name, rule)
        if not conforms and strict_mode:
            errors.append(f"Tag '{tag_name}' does not conform to rule: {rule.pattern}")
        elif not conforms:
            warnings.append(f"Tag '{tag_name}' does not follow recommended rule: {rule.pattern}")

    # 3. Convention checks
    if tag_name != tag_name.upper():
        warnings.append("Convention: tags should be uppercase")
    if " " in tag_name:
        errors.append("Tags cannot contain spaces")
    if len(tag_name) > 100:
        errors.append("Tag name too long (max 100 characters)")

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "tag_name": tag_name,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CSV Import (Rockwell DCS export)
# ═══════════════════════════════════════════════════════════════════════════════


async def import_tags_from_csv(
    *,
    file_content: bytes,
    project_id: str,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> dict:
    """Import DCS tags from a CSV file.

    Expected columns (flexible): TAG_NAME, TAG_TYPE, AREA, DESCRIPTION,
    ENG_UNIT, RANGE_MIN, RANGE_MAX, DCS_ADDRESS
    """
    from app.models.pid_pfd import DCSTag

    reader = csv.DictReader(io.StringIO(file_content.decode("utf-8", errors="replace")))
    stats = {"created": 0, "updated": 0, "errors": [], "skipped": 0}

    for row_num, row in enumerate(reader, start=2):  # start=2 (header is row 1)
        tag_name = (row.get("TAG_NAME") or row.get("Tag") or row.get("tag_name") or "").strip().upper()
        if not tag_name:
            stats["skipped"] += 1
            continue

        # Validate
        validation = await validate_tag_name(
            tag_name=tag_name,
            tag_type=(row.get("TAG_TYPE") or row.get("Type") or "other").upper()[:20],
            entity_id=entity_id,
            project_id=project_id,
            db=db,
        )

        # Allow updates even if tag exists
        has_real_errors = [e for e in validation["errors"] if "already exists" not in e]
        if has_real_errors:
            stats["errors"].append(
                {
                    "row": row_num,
                    "tag": tag_name,
                    "error": has_real_errors[0],
                }
            )
            continue

        # Check if already exists
        existing_result = await db.execute(
            select(DCSTag).where(
                DCSTag.entity_id == entity_id,
                DCSTag.project_id == UUID(project_id),
                DCSTag.tag_name == tag_name,
            )
        )
        existing = existing_result.scalar_one_or_none()

        tag_data = {
            "tag_type": (row.get("TAG_TYPE") or row.get("Type") or "other").upper()[:20],
            "area": (row.get("AREA") or row.get("Area") or "").upper()[:50] or None,
            "description": row.get("DESCRIPTION") or row.get("Description") or row.get("DESC"),
            "engineering_unit": row.get("ENG_UNIT") or row.get("Unit") or row.get("UNIT"),
            "range_min": _safe_float(row.get("RANGE_MIN") or row.get("Range_Min")),
            "range_max": _safe_float(row.get("RANGE_MAX") or row.get("Range_Max")),
            "dcs_address": row.get("DCS_ADDRESS") or row.get("Address") or row.get("ADDRESS"),
        }

        if existing:
            for k, v in tag_data.items():
                if v is not None:
                    setattr(existing, k, v)
            existing.source = "csv"
            existing.updated_at = datetime.now(UTC)
            stats["updated"] += 1
        else:
            db.add(
                DCSTag(
                    entity_id=entity_id,
                    project_id=UUID(project_id),
                    tag_name=tag_name,
                    source="csv",
                    created_by=user_id,
                    **{k: v for k, v in tag_data.items() if v is not None},
                )
            )
            stats["created"] += 1

    await db.commit()

    logger.info(
        "CSV import: %d created, %d updated, %d errors, %d skipped",
        stats["created"],
        stats["updated"],
        len(stats["errors"]),
        stats["skipped"],
    )
    return stats


# ═══════════════════════════════════════════════════════════════════════════════
# Bulk rename
# ═══════════════════════════════════════════════════════════════════════════════


async def preview_bulk_rename(
    *,
    entity_id: UUID,
    project_id: str,
    filter_area: str | None = None,
    filter_type: str | None = None,
    filter_pattern: str | None = None,
    rename_pattern: str,
    db: AsyncSession,
) -> list[dict]:
    """Preview the result of a bulk rename operation."""
    from app.models.pid_pfd import DCSTag

    query = select(DCSTag).where(
        DCSTag.entity_id == entity_id,
        DCSTag.project_id == UUID(project_id),
        DCSTag.is_active == True,  # noqa: E712
    )

    if filter_area:
        query = query.where(DCSTag.area == filter_area)
    if filter_type:
        query = query.where(DCSTag.tag_type == filter_type)
    if filter_pattern:
        # Convert glob pattern (ZONE-A-*) to SQL LIKE
        sql_pattern = filter_pattern.replace("*", "%").replace("?", "_")
        query = query.where(DCSTag.tag_name.ilike(sql_pattern))

    result = await db.execute(query.order_by(DCSTag.tag_name))
    tags = result.scalars().all()

    preview = []
    for tag in tags:
        new_name = _apply_rename_pattern(tag.tag_name, rename_pattern)
        if new_name != tag.tag_name:
            preview.append(
                {
                    "tag_id": str(tag.id),
                    "old_name": tag.tag_name,
                    "new_name": new_name,
                }
            )

    return preview


async def execute_bulk_rename(
    *,
    entity_id: UUID,
    project_id: str,
    renames: list[dict],  # [{"tag_id": "...", "new_name": "..."}]
    user_id: UUID,
    db: AsyncSession,
) -> dict:
    """Execute a bulk rename and update all references."""
    from app.models.pid_pfd import DCSTag

    renamed = 0
    for entry in renames:
        tag_result = await db.execute(
            select(DCSTag).where(
                DCSTag.id == UUID(entry["tag_id"]),
                DCSTag.entity_id == entity_id,
            )
        )
        tag = tag_result.scalar_one_or_none()
        if tag:
            old_name = tag.tag_name
            tag.tag_name = entry["new_name"]
            tag.updated_at = datetime.now(UTC)
            renamed += 1

            logger.info(
                "Renamed tag %s → %s (project %s, by user %s)",
                old_name,
                entry["new_name"],
                project_id,
                user_id,
            )

    await db.commit()
    return {"renamed": renamed, "total_requested": len(renames)}


# ═══════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════════


async def _get_next_tag_sequence(
    entity_id: UUID,
    project_id: str,
    tag_type: str,
    area: str,
    db: AsyncSession,
) -> int:
    """Get the next sequence number for a tag type in an area."""
    from app.models.pid_pfd import DCSTag

    count_result = await db.execute(
        select(func.count()).where(
            DCSTag.entity_id == entity_id,
            DCSTag.project_id == UUID(project_id),
            DCSTag.tag_type == tag_type,
            DCSTag.area == area if area else True,
        )
    )
    return (count_result.scalar() or 0) + 1


async def _get_applicable_rules(
    tag_type: str,
    entity_id: UUID,
    db: AsyncSession,
) -> list[Any]:
    """Get naming rules applicable to a tag type."""
    from app.models.pid_pfd import TagNamingRule

    result = await db.execute(
        select(TagNamingRule)
        .where(
            TagNamingRule.entity_id == entity_id,
            or_(
                TagNamingRule.applies_to_types.contains([tag_type]),
                TagNamingRule.applies_to_types == cast("[]", JSONB),
            ),
        )
        .order_by(TagNamingRule.is_default.desc())
    )
    return result.scalars().all()


def _apply_tag_rule(rule: Any, values: dict[str, str]) -> str:
    """Apply a naming rule to generate a tag name."""
    result = rule.pattern
    for key, val in values.items():
        result = result.replace(f"{{{key}}}", val)

    # Handle {SEQ:N}
    result = re.sub(
        r"\{SEQ:(\d+)\}",
        lambda m: values.get("SEQ", "001").zfill(int(m.group(1))),
        result,
    )

    return result.replace(rule.separator * 2, rule.separator).strip(rule.separator)


def _tag_matches_rule(tag_name: str, rule: Any) -> bool:
    """Check if a tag name matches a naming rule pattern."""
    # Convert pattern to regex
    pattern = rule.pattern
    # Replace known tokens with regex groups
    regex = pattern
    regex = re.sub(r"\{AREA\}", r"[A-Z0-9]+", regex)
    regex = re.sub(r"\{TYPE\}", r"[A-Z]+", regex)
    regex = re.sub(r"\{SEQ:\d+\}", r"[0-9]+", regex)
    regex = re.sub(r"\{[^}]+\}", r"[A-Za-z0-9]+", regex)  # generic tokens

    # Escape separator
    regex = regex.replace(rule.separator, re.escape(rule.separator))

    return bool(re.fullmatch(regex, tag_name, re.IGNORECASE))


def _get_seq_digits(pattern: str) -> int:
    """Extract the number of digits from {SEQ:N} in a pattern."""
    match = re.search(r"\{SEQ:(\d+)\}", pattern)
    return int(match.group(1)) if match else 3


def _apply_rename_pattern(old_name: str, pattern: str) -> str:
    """Apply a rename pattern like 'ZONE-A-* → ZONE-B-*'."""
    if " → " in pattern or " -> " in pattern:
        parts = re.split(r"\s*[→\->]+\s*", pattern, maxsplit=1)
        if len(parts) == 2:
            from_pat, to_pat = parts
            # Convert glob to regex
            from_regex = from_pat.replace("*", "(.*)").replace("?", "(.)")
            match = re.fullmatch(from_regex, old_name, re.IGNORECASE)
            if match:
                result = to_pat
                for i, group in enumerate(match.groups(), 1):
                    result = result.replace("*", group, 1)
                return result
    return old_name


def _safe_float(value: str | None) -> float | None:
    """Safely convert to float."""
    if not value:
        return None
    try:
        return float(value.strip())
    except (ValueError, TypeError):
        return None

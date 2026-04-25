"""Document nomenclature / numbering service.

Generates unique document numbers from configurable patterns.
Thread-safe via PostgreSQL SELECT FOR UPDATE on sequence rows.
"""

import logging
import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_document_number(
    *,
    doc_type_id: UUID,
    nomenclature_pattern: str,
    discipline: str | None,
    doc_type_code: str,
    project_code: str | None,
    project_id: UUID | None,
    tenant_slug: str,
    bu_code: str | None,
    free_parts: dict[str, str] | None = None,
    db: AsyncSession,
) -> str:
    """
    Generate the next document number from the pattern.

    Tokens:
        {TENANT}  – tenant slug (upper)
        {PROJ}    – project code (upper)
        {DISC}    – discipline from doc_type
        {TYPE}    – doc_type code (upper)
        {SEQ:N}   – auto-incremented sequence, zero-padded to N digits
        {YEAR}    – 4-digit year
        {MONTH}   – 2-digit month
        {BU}      – BU code (upper)
        {PHASE}   – free-form project phase
        {FREE}    – free-form text

    Thread-safe via FOR UPDATE lock on DocumentSequence row.
    """
    from app.models.papyrus_document import DocumentSequence

    free_parts = free_parts or {}
    now = datetime.now(timezone.utc)

    # Retrieve or create the sequence for this doc_type+project
    seq_value = await _get_next_sequence(
        doc_type_id=doc_type_id,
        project_id=project_id,
        db=db,
    )

    # Build token replacements. ENTITY/DOCTYPE are aliases of TENANT/TYPE
    # — older presets use the long form (cf E2E bug #23 where doc numbers
    # rendered as "{ENTITY}-{DOCTYPE}-0002" because these aliases were
    # missing from the replacement map and stayed as raw placeholders).
    replacements: dict[str, str] = {
        "TENANT": tenant_slug.upper(),
        "ENTITY": tenant_slug.upper(),
        "PROJ": (project_code or "").upper(),
        "DISC": (discipline or "").upper(),
        "TYPE": doc_type_code.upper(),
        "DOCTYPE": doc_type_code.upper(),
        "YEAR": str(now.year),
        "MONTH": f"{now.month:02d}",
        "BU": (bu_code or "").upper(),
        "PHASE": free_parts.get("PHASE", "").upper(),
        "FREE": free_parts.get("FREE", ""),
    }

    result = nomenclature_pattern
    for key, val in replacements.items():
        result = result.replace(f"{{{key}}}", val)

    # Handle {SEQ:N} with zero-padding
    result = re.sub(
        r"\{SEQ:(\d+)\}",
        lambda m: str(seq_value).zfill(int(m.group(1))),
        result,
    )

    # Clean double hyphens from empty tokens
    result = re.sub(r"-{2,}", "-", result).strip("-")

    logger.info(
        "Generated document number: %s (seq=%d, type=%s, project=%s)",
        result,
        seq_value,
        doc_type_code,
        project_code,
    )
    return result


def generate_next_revision_code(current_code: str, scheme: str = "alpha") -> str:
    """
    Calculate the next revision code based on the revision scheme.

    Schemes:
        alpha   – 0, A, B, C, …, Z, AA, AB, …
        numeric – 1, 2, 3, …
        semver  – 1.0, 1.1, 1.2, …, 2.0
    """
    if scheme == "alpha":
        if current_code == "0":
            return "A"
        if len(current_code) == 1 and current_code.isalpha():
            if current_code.upper() == "Z":
                return "AA"
            return chr(ord(current_code.upper()) + 1)
        # Multi-char alpha: AA, AB, ...
        if current_code.isalpha():
            last = current_code[-1]
            if last.upper() == "Z":
                return current_code[:-1] + chr(ord(current_code[-2].upper()) + 1) + "A"
            return current_code[:-1] + chr(ord(last.upper()) + 1)
        return "A"

    elif scheme == "numeric":
        try:
            return str(int(current_code) + 1)
        except ValueError:
            return "1"

    elif scheme == "semver":
        parts = current_code.split(".")
        if len(parts) == 2:
            try:
                major, minor = int(parts[0]), int(parts[1])
                return f"{major}.{minor + 1}"
            except ValueError:
                return "1.0"
        return "1.0"

    return current_code


# ═══════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════════


async def _get_next_sequence(
    *,
    doc_type_id: UUID,
    project_id: UUID | None,
    db: AsyncSession,
) -> int:
    """Atomically increment the sequence for doc_type + project.

    Uses SELECT FOR UPDATE to prevent concurrent duplicates.
    """
    from app.models.papyrus_document import DocumentSequence

    stmt = (
        select(DocumentSequence)
        .where(
            DocumentSequence.doc_type_id == doc_type_id,
            DocumentSequence.project_id == project_id,
        )
        .with_for_update()
    )
    result = await db.execute(stmt)
    seq_row = result.scalar_one_or_none()

    if seq_row:
        seq_row.current_value += 1
        next_val = seq_row.current_value
    else:
        seq_row = DocumentSequence(
            doc_type_id=doc_type_id,
            project_id=project_id,
            current_value=1,
        )
        db.add(seq_row)
        next_val = 1

    # Flush to ensure the lock is held
    await db.flush()
    return next_val


def validate_nomenclature_pattern(pattern: str) -> list[str]:
    """Validate a nomenclature pattern and return any errors."""
    errors: list[str] = []
    known_tokens = {
        "TENANT", "ENTITY", "PROJ", "DISC", "TYPE", "DOCTYPE",
        "YEAR", "MONTH", "BU", "PHASE", "FREE",
    }

    # Find all tokens
    tokens = re.findall(r"\{([^}]+)\}", pattern)
    for token in tokens:
        # Handle SEQ:N
        if token.startswith("SEQ:"):
            try:
                digits = int(token.split(":")[1])
                if digits < 1 or digits > 10:
                    errors.append(f"SEQ digits must be between 1 and 10, got {digits}")
            except (ValueError, IndexError):
                errors.append(f"Invalid SEQ token: {{{token}}}. Expected {{SEQ:N}}")
        elif token not in known_tokens:
            errors.append(f"Unknown token: {{{token}}}. Valid: {', '.join(sorted(known_tokens))}")

    if not tokens:
        errors.append("Pattern must contain at least one token")

    # Check for SEQ presence (usually required)
    has_seq = any(t.startswith("SEQ:") for t in tokens)
    if not has_seq:
        errors.append("Pattern should contain a {SEQ:N} token for uniqueness")

    return errors


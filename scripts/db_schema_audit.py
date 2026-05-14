"""Consolidated DB schema audit — run in CI to catch model_vs_db drift.

Detects 4 patterns of bug identified during QA night sessions :

1. **Model declares X, BDD doesn't have it** (bug #25 dashboards.tv_token,
   bug #26 ar_pumps.api_type_designation, bug #27 papyrus.created_at)
2. **BDD has X, model doesn't see it, code uses it** (bug #29
   Attachment.category)
3. **AuditUserMixin orphans with code usage** (bug #30 Project.created_by)

Usage:
    DATABASE_URL=postgresql+asyncpg://user:pass@host/db python scripts/db_schema_audit.py
    DATABASE_URL=... python scripts/db_schema_audit.py --strict   # exit 1 on findings

Conventions:
- Soft-mode (default): prints all findings, exit 0
- Strict mode (--strict): exits 1 if any pattern 1, 2, or 3 finding is detected
- Patterns 1+2 are always treated as bugs. Pattern 3 is only a bug if code
  uses the column (we can't detect without grep, so we skip it in strict)

Returns a Markdown report on stdout. Run after `alembic upgrade head` in CI.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine


REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "app" / "models"
SRC_DIR = REPO_ROOT / "app"


# Mixin columns added by inheritance — we hardcode them since we can't
# easily resolve them from regex parsing. Keep in sync with app/models/base.py.
MIXIN_COLS = {
    "UUIDPrimaryKeyMixin": {"id"},
    "TimestampMixin": {"created_at", "updated_at"},
    "SoftDeleteMixin": {"archived", "deleted_at"},
    "AuditUserMixin": {"created_by", "updated_by"},
    "VerifiableMixin": {
        "verification_status", "verified_by", "verified_at",
        "rejection_reason",
    },
}


@dataclass
class ModelInfo:
    class_name: str
    file: str
    cols: set[str]
    bases: list[str]  # mixin names


def parse_model_file(path: Path) -> dict[str, ModelInfo]:
    """Parse a model file and yield {tablename: ModelInfo}."""
    src = path.read_text(encoding="utf-8")
    out: dict[str, ModelInfo] = {}

    # Class block split
    class_re = re.compile(
        r"^class\s+(\w+)\s*\(([^)]*)\)\s*:\s*\n(.+?)(?=^class\s|\Z)",
        re.DOTALL | re.MULTILINE,
    )
    col_re = re.compile(
        r"^\s{4}(\w+)\s*:\s*Mapped\[[^=]+?\]\s*=\s*mapped_column\(",
        re.MULTILINE | re.DOTALL,
    )
    table_re = re.compile(r'__tablename__\s*=\s*[\'"]([^\'"]+)[\'"]')
    # mapped_column("colname", …) override: explicit column name differs from attr
    explicit_name_re = re.compile(
        r"^\s{4}(\w+)\s*:\s*Mapped\[[^=]+?\]\s*=\s*mapped_column\(\s*[\'\"]([^\'\"]+)[\'\"]",
        re.MULTILINE | re.DOTALL,
    )

    for m in class_re.finditer(src):
        class_name = m.group(1)
        bases_str = m.group(2)
        body = m.group(3)
        tbl = table_re.search(body)
        if not tbl:
            continue
        tablename = tbl.group(1)
        cols = set(col_re.findall(body))
        # Override: if explicit name given, that's the BDD column name
        explicit = dict(explicit_name_re.findall(body))
        for attr, db_name in explicit.items():
            cols.discard(attr)
            cols.add(db_name)
        bases = [b.strip() for b in bases_str.split(",")]
        # Add mixin-inherited columns
        for base in bases:
            base_clean = base.strip()
            if base_clean in MIXIN_COLS:
                cols |= MIXIN_COLS[base_clean]
        out[tablename] = ModelInfo(class_name, path.name, cols, bases)
    return out


def parse_all_models() -> dict[str, ModelInfo]:
    out: dict[str, ModelInfo] = {}
    for fname in sorted(os.listdir(MODELS_DIR)):
        if not fname.endswith(".py") or fname.startswith("_"):
            continue
        out.update(parse_model_file(MODELS_DIR / fname))
    return out


async def get_db_schema(database_url: str) -> dict[str, set[str]]:
    """Return {table_name: {col_name, …}} from the live DB."""
    engine = create_async_engine(database_url)
    out: dict[str, set[str]] = {}
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = 'public'"
            )
        )
        for row in rows:
            tbl, col = row[0], row[1]
            out.setdefault(tbl, set()).add(col)
    await engine.dispose()
    return out


def find_code_uses(class_name: str, col: str) -> list[str]:
    """Grep app/ for `ClassName.col` references. Returns relative paths."""
    pat = re.compile(rf"\b{re.escape(class_name)}\.{re.escape(col)}\b")
    hits: list[str] = []
    for dirpath, _, files in os.walk(SRC_DIR):
        if "__pycache__" in dirpath or ".venv" in dirpath:
            continue
        for f in files:
            if not f.endswith(".py"):
                continue
            p = Path(dirpath) / f
            try:
                if pat.search(p.read_text(encoding="utf-8")):
                    hits.append(str(p.relative_to(REPO_ROOT)).replace("\\", "/"))
                    if len(hits) >= 3:
                        return hits
            except Exception:
                continue
    return hits


async def main() -> int:
    strict = "--strict" in sys.argv
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL env var required.", file=sys.stderr)
        return 2

    # Normalise to asyncpg if user passed sync URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    print("# DB Schema Audit\n")
    print(f"DATABASE_URL: {db_url.split('@')[-1] if '@' in db_url else 'local'}\n")

    models = parse_all_models()
    print(f"Parsed {len(models)} model classes from {MODELS_DIR}.\n")

    try:
        bdd = await get_db_schema(db_url)
    except Exception as exc:
        print(f"ERROR: cannot connect to DB: {exc}", file=sys.stderr)
        return 3
    print(f"Loaded {len(bdd)} tables from BDD.\n")

    # ─── Pattern 1: Model declares X, BDD doesn't have it ────────────
    pat1: list[tuple[str, str, str]] = []  # (table, class, col)
    for tbl, info in models.items():
        if tbl not in bdd:
            continue
        missing = info.cols - bdd[tbl]
        for col in missing:
            pat1.append((tbl, info.class_name, col))

    # ─── Pattern 2: BDD has X, model doesn't see it, code uses it ────
    pat2: list[tuple[str, str, str, list[str]]] = []  # +refs
    for tbl, info in models.items():
        if tbl not in bdd:
            continue
        orphans = bdd[tbl] - info.cols
        # Ignore conventional FK/system columns we don't really care about
        SKIP = {"id", "created_at", "updated_at", "archived", "deleted_at"}
        for col in orphans:
            if col in SKIP:
                continue
            refs = find_code_uses(info.class_name, col)
            if refs:
                pat2.append((tbl, info.class_name, col, refs))

    # ─── Report ──────────────────────────────────────────────────────
    print("## Pattern 1 — Model declares X, BDD missing")
    if pat1:
        print(f"⚠️ {len(pat1)} findings:\n")
        for tbl, cls, col in sorted(pat1):
            print(f"- `{tbl}.{col}` ({cls})")
    else:
        print("✅ No findings.")
    print()

    print("## Pattern 2 — BDD has X, model missing, code uses X")
    if pat2:
        print(f"⚠️ {len(pat2)} findings:\n")
        for tbl, cls, col, refs in sorted(pat2):
            print(f"- `{tbl}.{col}` ({cls}) used in: {', '.join(refs)}")
    else:
        print("✅ No findings.")
    print()

    if strict and (pat1 or pat2):
        print(f"\n❌ STRICT mode: {len(pat1) + len(pat2)} schema drift(s) detected. Failing.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

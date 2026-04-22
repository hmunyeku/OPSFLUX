"""Seed i18n catalog from the mobile app's hardcoded locale files.

Parses apps/mobile/src/locales/{fr,en,es,pt}.ts (nested objects) and
flattens them into dot-notation keys, then upserts each (key, lang) row
into i18n_messages.

After inserting, recomputes the catalog hash for each (lang, namespace).

Run once after the 126_i18n_catalog migration:
    docker exec backend python -m scripts.seed_i18n
or locally:
    python -m scripts.seed_i18n
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.database import async_session_factory
from app.models.common import I18nCatalogMeta, I18nLanguage, I18nMessage

MOBILE_LOCALES_DIR = Path(__file__).resolve().parent.parent / "apps" / "mobile" / "src" / "locales"
APP_LOCALES_DIR = Path(__file__).resolve().parent.parent / "apps" / "main" / "src" / "locales"
SEED_DIR = Path(__file__).resolve().parent / "i18n_seed"
# When True (--force flag), overwrite existing translations with values from
# the JSON files. Default False = preserve admin edits, only insert new keys.
FORCE = "--force" in sys.argv


def _parse_ts_object(text: str) -> dict:
    """
    Minimal TS object parser — handles strings (double or single quote),
    nested objects, trailing commas, line/block comments. Sufficient for
    our hand-authored locale files.

    Not a general TS parser: no template literals, no spreads, no
    computed keys.
    """
    # Strip line + block comments (outside of strings is a simplification;
    # our locale files don't put // inside strings).
    text = re.sub(r"//[^\n]*", "", text)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)

    # Extract the object literal (first {..matched..})
    start = text.index("{")
    depth = 0
    end = -1
    in_str = False
    str_char = ""
    escape = False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == str_char:
                in_str = False
            continue
        if c in ('"', "'"):
            in_str = True
            str_char = c
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        raise ValueError("Unbalanced braces")
    body = text[start : end + 1]

    # Convert single-quoted strings into double-quoted JSON strings,
    # escaping any embedded double quotes.
    def _single_to_double(match: re.Match) -> str:
        inner = match.group(1)
        # Unescape \' then escape " and \
        inner = inner.replace("\\'", "'")
        inner = inner.replace("\\", "\\\\").replace('"', '\\"')
        return '"' + inner + '"'

    # Simple state machine to walk the body, swapping only single-quoted
    # strings while leaving double-quoted ones untouched.
    out = []
    i = 0
    while i < len(body):
        c = body[i]
        if c == '"':
            # copy until matching unescaped "
            j = i + 1
            while j < len(body):
                if body[j] == "\\":
                    j += 2
                    continue
                if body[j] == '"':
                    break
                j += 1
            out.append(body[i : j + 1])
            i = j + 1
        elif c == "'":
            j = i + 1
            inner_start = j
            while j < len(body):
                if body[j] == "\\":
                    j += 2
                    continue
                if body[j] == "'":
                    break
                j += 1
            inner = body[inner_start:j]
            inner = inner.replace("\\'", "'")
            inner = inner.replace("\\", "\\\\").replace('"', '\\"')
            out.append('"' + inner + '"')
            i = j + 1
        else:
            out.append(c)
            i += 1
    body = "".join(out)

    # Quote bare identifier keys -> JSON keys
    body = re.sub(
        r'([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:',
        lambda m: f'{m.group(1)}"{m.group(2)}":',
        body,
    )
    # Remove trailing commas
    body = re.sub(r",(\s*[}\]])", r"\1", body)

    import json
    return json.loads(body)


def _flatten(node: dict, prefix: str = "") -> dict[str, str]:
    flat: dict[str, str] = {}
    for k, v in node.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            flat.update(_flatten(v, key))
        else:
            flat[key] = str(v)
    return flat


def _load_locale(code: str, namespace: str = "mobile") -> dict[str, str]:
    """Load a locale from various sources depending on namespace.

    For 'mobile': scripts/i18n_seed/{code}.json or apps/mobile/src/locales/{code}.ts
    For 'app': apps/main/src/locales/{code}/common.json (nested → flattened)
    """
    if namespace == "app":
        json_path = APP_LOCALES_DIR / code / "common.json"
        if json_path.exists():
            import json as _json
            obj = _json.loads(json_path.read_text(encoding="utf-8"))
            return _flatten(obj)
        print(f"[skip] no app locale for {code}")
        return {}

    # namespace == "mobile"
    json_path = SEED_DIR / f"{code}.json"
    if json_path.exists():
        import json as _json
        return _json.loads(json_path.read_text(encoding="utf-8"))
    # Fallback: parse the TS file (legacy)
    ts_path = MOBILE_LOCALES_DIR / f"{code}.ts"
    if not ts_path.exists():
        print(f"[skip] no source for {code} (.json or .ts)")
        return {}
    obj = _parse_ts_object(ts_path.read_text(encoding="utf-8"))
    return _flatten(obj)


async def _seed_namespace(db, namespace: str, languages: list[str], existing_langs: set[str]) -> int:
    """Seed one namespace across all available languages. Returns total pairs inserted."""
    total = 0
    for code in languages:
        if code not in existing_langs:
            continue
        messages = _load_locale(code, namespace=namespace)
        if not messages:
            continue
        print(f"[{namespace}/{code}] {len(messages)} messages")

        for key, value in messages.items():
            stmt = pg_insert(I18nMessage).values(
                key=key,
                language_code=code,
                namespace=namespace,
                value=value,
                updated_by=None,
            )
            if FORCE:
                stmt = stmt.on_conflict_do_update(
                    index_elements=["key", "language_code"],
                    set_={"value": stmt.excluded.value},
                )
            else:
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["key", "language_code"],
                )
            await db.execute(stmt)
            total += 1

        # Recompute hash
        rows = (
            await db.execute(
                select(I18nMessage.key, I18nMessage.value)
                .where(I18nMessage.language_code == code)
                .where(I18nMessage.namespace == namespace)
                .order_by(I18nMessage.key)
            )
        ).all()
        payload = "\n".join(f"{k}={v}" for k, v in rows).encode("utf-8")
        digest = hashlib.sha256(payload).hexdigest()

        upsert_meta = pg_insert(I18nCatalogMeta).values(
            language_code=code,
            namespace=namespace,
            hash=digest,
            message_count=len(rows),
        )
        upsert_meta = upsert_meta.on_conflict_do_update(
            index_elements=["language_code", "namespace"],
            set_={
                "hash": upsert_meta.excluded.hash,
                "message_count": upsert_meta.excluded.message_count,
            },
        )
        await db.execute(upsert_meta)
        print(f"[{namespace}/{code}] hash={digest[:12]}… count={len(rows)}")

    return total


async def seed() -> None:
    async with async_session_factory() as db:
        # Languages the seed script will attempt to push. For codes that
        # lack a bundled frontend JSON (apps/main/src/locales/<code>/),
        # the script falls through with a [skip] notice — translations
        # for those codes live only in the DB (hand-edited via the
        # admin UI, or auto-generated via /admin/ai-translate from fr).
        known = ["fr", "en", "es", "it", "pt"]
        existing = {
            r.code
            for r in (await db.execute(select(I18nLanguage))).scalars().all()
        }
        for code in known:
            if code not in existing:
                print(f"[warn] Language '{code}' is not registered — skipping.")

        total = 0

        # Seed mobile namespace (legacy mobile app translations)
        total += await _seed_namespace(db, "mobile", known, existing)

        # Seed app namespace (main web app translations from JSON files)
        app_langs = [c for c in known if (APP_LOCALES_DIR / c / "common.json").exists()]
        if app_langs:
            total += await _seed_namespace(db, "app", app_langs, existing)
        else:
            print("[app] no locale files found — skipping")

        await db.commit()
        print(f"\n✓ Seeded {total} (key, lang) pairs across {len(known)} languages.")


if __name__ == "__main__":
    asyncio.run(seed())

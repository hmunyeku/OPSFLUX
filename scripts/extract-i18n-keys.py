#!/usr/bin/env python3
"""
Extract all t("key", "fallback") calls from mobile screens and write
flat JSON catalogs to scripts/i18n_seed/{fr,en,es,pt}.json.

Run from the repo root after adding new t() calls in the mobile code:

    python3 scripts/extract-i18n-keys.py

Then re-seed the DB:

    docker exec backend python -m scripts.seed_i18n
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MOBILE_SRC = ROOT / "apps" / "mobile" / "src"
SEED_DIR = ROOT / "scripts" / "i18n_seed"

PATTERN_DOUBLE = re.compile(
    r"""\bt\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"""",
    re.DOTALL,
)
PATTERN_SINGLE = re.compile(
    r"""\bt\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'""",
    re.DOTALL,
)


def extract() -> dict[str, str]:
    keys: dict[str, str] = {}
    for f in list(MOBILE_SRC.rglob("*.tsx")) + list(MOBILE_SRC.rglob("*.ts")):
        if "node_modules" in str(f):
            continue
        text = f.read_text(encoding="utf-8")
        for pattern in (PATTERN_DOUBLE, PATTERN_SINGLE):
            for m in pattern.finditer(text):
                k = m.group(1)
                v = (m.group(2) or "").replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n")
                if k and k not in keys:
                    keys[k] = v
    return dict(sorted(keys.items()))


def main() -> None:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    fr_keys = extract()
    print(f"Extracted {len(fr_keys)} keys from {MOBILE_SRC}", file=sys.stderr)

    # Write FR (the source of truth from t() fallbacks)
    (SEED_DIR / "fr.json").write_text(
        json.dumps(fr_keys, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # For other languages, only update keys that don't already exist —
    # we don't overwrite existing translations.
    for lang in ("en", "es", "pt"):
        path = SEED_DIR / f"{lang}.json"
        existing: dict[str, str] = {}
        if path.exists():
            existing = json.loads(path.read_text(encoding="utf-8"))
        for k, v in fr_keys.items():
            if k not in existing:
                # Use FR as initial value; admin will translate via UI.
                existing[k] = v
        # Drop keys that no longer exist
        existing = {k: v for k, v in existing.items() if k in fr_keys}
        existing = dict(sorted(existing.items()))
        path.write_text(
            json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"  {lang}.json: {len(existing)} keys", file=sys.stderr)

    print(f"\nDone. Re-seed via: docker exec backend python -m scripts.seed_i18n", file=sys.stderr)


if __name__ == "__main__":
    main()

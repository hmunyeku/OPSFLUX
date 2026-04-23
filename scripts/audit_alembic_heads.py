#!/usr/bin/env python3
"""Assert the Alembic history has exactly one head.

Multiple heads block `alembic upgrade head` with:
    ERROR: Multiple head revisions are present.
A merge migration (declaring all heads as `down_revision` tuple) must
be added before further migrations are appended.

Run: python scripts/audit_alembic_heads.py
Exit 0 when a single head exists, 1 otherwise.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSIONS = ROOT / "alembic" / "versions"


def parse_migration(path: Path) -> tuple[str | None, list[str] | None]:
    """Return (revision, [down_revisions]) or (None, None) if unparseable."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError):
        return None, None
    rev: str | None = None
    down: list[str] | None = None
    for node in tree.body:
        # Handles both `revision = "…"` and `revision: str = "…"`.
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
        elif isinstance(node, ast.AnnAssign):
            target = node.target
        else:
            continue
        if not isinstance(target, ast.Name):
            continue
        if target.id == "revision" and isinstance(node.value, ast.Constant):
            rev = str(node.value.value) if node.value.value else None
        elif target.id == "down_revision":
            v = node.value
            if isinstance(v, ast.Constant):
                down = [str(v.value)] if v.value else []
            elif isinstance(v, (ast.Tuple, ast.List)):
                down = [
                    str(elt.value)
                    for elt in v.elts
                    if isinstance(elt, ast.Constant) and elt.value
                ]
    return rev, down


def main() -> int:
    revs: dict[str, list[str]] = {}
    for p in VERSIONS.glob("*.py"):
        rev, down = parse_migration(p)
        if rev and down is not None:
            revs[rev] = down

    children: set[str] = set()
    for parents in revs.values():
        children.update(parents)

    heads = sorted(r for r in revs if r not in children)
    print(f"Alembic revisions: {len(revs)}")
    print(f"Heads ({len(heads)}):")
    for h in heads:
        print(f"  {h}")

    if len(heads) != 1:
        print(
            "\nERROR: expected exactly 1 head. "
            "Add a merge migration declaring the current heads as `down_revision` tuple."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

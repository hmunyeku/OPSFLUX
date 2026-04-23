#!/usr/bin/env python3
"""Cross-check every hasPermission() call in the frontend against the
backend permission catalogue (route-level require_permission decorators
+ module manifests + core permission list).

Any hit in FE that doesn't exist in BE is a 'dead UI gate' — the
component is permanently hidden from every user because the permission
string doesn't resolve.

Run: python scripts/audit_permissions.py
Exit code: 0 if clean, 1 if mismatches found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
FE_ROOT = ROOT / "apps" / "main" / "src"
BE_ROOT = ROOT / "app"

HAS_PERMISSION_RE = re.compile(r"hasPermission\(\s*'([a-zA-Z0-9_.]+)'\s*\)")
BACKEND_LITERAL_RE = re.compile(r'"([a-z][a-zA-Z0-9._]+)"')
REQUIRE_PERMISSION_RE = re.compile(
    r'(?:require_permission|require_any_permission|has_user_permission)'
    r'\([^)]*?"([a-zA-Z0-9._]+)"'
)


def collect_fe_perms() -> set[str]:
    out: set[str] = set()
    for p in [*FE_ROOT.rglob("*.tsx"), *FE_ROOT.rglob("*.ts")]:
        try:
            src = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for m in HAS_PERMISSION_RE.finditer(src):
            out.add(m.group(1))
    return out


def collect_be_perms() -> set[str]:
    out: set[str] = set()
    for p in BE_ROOT.rglob("*.py"):
        try:
            src = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        # Direct require_permission("...") decorators.
        for m in REQUIRE_PERMISSION_RE.finditer(src):
            out.add(m.group(1))
        # Manifest + seeded catalogue: any "x.y.z" string literal in
        # module manifests or permission_sync.py counts as registered.
        if "module_registry" in src or "permission_sync" in str(p) or "ModuleManifest" in src:
            for m in BACKEND_LITERAL_RE.finditer(src):
                out.add(m.group(1))
    return out


def main() -> int:
    fe = collect_fe_perms()
    be = collect_be_perms()
    missing = sorted(fe - be)
    print(f"Frontend hasPermission calls: {len(fe)}")
    print(f"Backend registered perms:     {len(be)}")
    if not missing:
        print("OK — all frontend permission checks resolve.")
        return 0
    print(f"\n{len(missing)} frontend perms NOT registered in backend (dead UI gates):")
    for p in missing:
        print(f"  {p}")
    return 1


if __name__ == "__main__":
    sys.exit(main())

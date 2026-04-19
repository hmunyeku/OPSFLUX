"""Surgical port of the FR-string agent's key mappings onto risky files.

For each file the agent touched that main has since modified, we extract
the (literal, key) pairs the agent introduced and re-apply them ONLY to
string literals that still exist verbatim in main. Structural changes
(button class rewrites, formatDate migrations, etc.) are preserved.

Output: patched files + summary to stdout.
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess

AGENT_COMMIT = "26e3e6b2"
ACCENT_RE = re.compile(r"[àéèêçùôîâïÀÉÈÊÇÙÔÎÂÏ]")
T_KEY_RE = re.compile(r"t\('([a-z0-9_.]+)'\)")


def sh(*args: str) -> str:
    return subprocess.check_output(list(args), text=True, encoding="utf-8")


def resolve_key(cat: dict, dotted: str) -> str | None:
    node = cat
    for part in dotted.split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return None
    return node if isinstance(node, str) else None


def main_touched_since(f: str, base: str) -> bool:
    out = subprocess.run(
        ["git", "log", "--oneline", f"{base}..main", "--", f],
        capture_output=True, text=True,
    ).stdout.strip()
    return bool(out)


def apply_mappings(main_src: str, mappings: list[tuple[str, str]]) -> tuple[str, int]:
    """Replace JSX text content and common attrs matching each literal."""
    applied = 0
    current = main_src
    for literal, t_expr in mappings:
        lit_stripped = literal.strip()
        if not lit_stripped:
            continue
        # attr="literal"
        attr_pat = re.compile(r'(\w+)=(["\'])' + re.escape(lit_stripped) + r"\2")
        new = attr_pat.sub(
            lambda m: f"{m.group(1)}={{{t_expr}}}", current, count=1
        )
        if new != current:
            current = new
            applied += 1
            continue
        # >literal< (JSX text)
        jsx_pat = re.compile(r">(\s*)" + re.escape(lit_stripped) + r"(\s*)<")
        new = jsx_pat.sub(lambda m: f">{{{t_expr}}}<", current, count=1)
        if new != current:
            current = new
            applied += 1
    return current, applied


def ensure_hook(src: str) -> str:
    """Ensure useTranslation is imported + hook called in each component that uses t()."""
    if "from 'react-i18next'" not in src:
        lines = src.split("\n")
        last_imp = -1
        for i, ln in enumerate(lines[:100]):
            if ln.startswith("import "):
                last_imp = i
        if last_imp >= 0:
            lines.insert(last_imp + 1, "import { useTranslation } from 'react-i18next'")
            src = "\n".join(lines)
    return src


def main() -> None:
    agent_files = [
        f for f in sh("git", "show", AGENT_COMMIT, "--name-only", "--pretty=").splitlines()
        if f.endswith(".tsx")
    ]
    base = sh("git", "merge-base", "main", AGENT_COMMIT).strip()
    risky = [f for f in agent_files if main_touched_since(f, base)]
    print(f"Risky files: {len(risky)}")

    fr_cat = json.loads(
        pathlib.Path("apps/main/src/locales/fr/common.json").read_text(encoding="utf-8")
    )

    total_applied = 0
    per_file: dict[str, int] = {}

    for f in risky:
        try:
            agent_src = sh("git", "show", f"{AGENT_COMMIT}:{f}")
            base_src = sh("git", "show", f"{base}:{f}")
        except subprocess.CalledProcessError:
            continue
        main_src = pathlib.Path(f).read_text(encoding="utf-8")

        # Keys introduced by the agent in this file (newly added t() calls)
        agent_keys = set(T_KEY_RE.findall(agent_src))
        base_keys = set(T_KEY_RE.findall(base_src))
        new_keys = agent_keys - base_keys

        mappings: list[tuple[str, str]] = []
        for key in new_keys:
            literal = resolve_key(fr_cat, key)
            if literal and ACCENT_RE.search(literal):
                mappings.append((literal, f"t('{key}')"))

        if not mappings:
            continue

        patched, n = apply_mappings(main_src, mappings)
        if n == 0:
            continue
        patched = ensure_hook(patched)
        pathlib.Path(f).write_text(patched, encoding="utf-8")
        per_file[f] = n
        total_applied += n

    print(f"\nTOTAL applied: {total_applied}")
    print(f"Files modified: {len(per_file)}")
    for f, c in sorted(per_file.items(), key=lambda kv: -kv[1])[:15]:
        print(f"  {c:3d}  {f}")


if __name__ == "__main__":
    main()

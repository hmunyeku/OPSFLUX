#!/bin/bash
# =============================================================================
# Branch & worktree cleanup — keep only main + mobile-standalone.
#
# RUN FROM: C:\Users\matth\Desktop\OPSFLUX (main checkout)
# DO NOT run from any worktree under .claude/worktrees/ — they get deleted.
# =============================================================================
set -euo pipefail

REPO=/c/Users/matth/Desktop/OPSFLUX
cd "$REPO"

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "ERROR: must run from main branch (current: $(git rev-parse --abbrev-ref HEAD))"
  exit 1
fi

if [ -n "$(git status --porcelain | grep -v '^??')" ]; then
  echo "ERROR: working tree not clean. Commit or stash first."
  git status --short
  exit 1
fi

echo "════════════════════════════════════════════════════════════════"
echo "  Cleanup OpsFlux: keep only main + mobile-standalone"
echo "════════════════════════════════════════════════════════════════"
echo

# ── 1. Remove worktrees ──────────────────────────────────────────────
echo "─── 1/6 Pruning git worktrees ───"
git worktree list
echo
# Loop over EVERY worktree in .claude/worktrees/ (not just hardcoded names)
# so future Claude session worktrees are also cleaned up automatically.
if [ -d .claude/worktrees ]; then
  for wt in .claude/worktrees/*/; do
    [ -d "$wt" ] || continue
    echo "  Removing worktree: $wt"
    git worktree remove --force "$wt" 2>&1 || echo "    (skipped — likely already removed)"
  done
  rmdir .claude/worktrees 2>/dev/null || true
fi
git worktree prune
echo "  ✓ Worktrees cleaned"
echo

# ── 2. Delete local branches except main + mobile-standalone ─────────
echo "─── 2/6 Deleting local branches ───"
KEEP="^(main|mobile-standalone)$"
for b in $(git branch --format='%(refname:short)' | grep -vE "$KEEP"); do
  echo "  Deleting local branch: $b"
  git branch -D "$b"
done
echo "  ✓ Local branches cleaned"
echo

# ── 3. Delete remote branches except main + mobile-standalone ────────
echo "─── 3/6 Deleting remote branches ───"
git fetch origin --prune
for b in $(git branch -r --format='%(refname:short)' | grep -v 'HEAD' | sed 's|^origin/||' | grep -vE "$KEEP"); do
  echo "  Deleting remote branch: origin/$b"
  git push origin --delete "$b" || echo "    (failed — branch may be protected)"
done
echo "  ✓ Remote branches cleaned"
echo

# ── 4. Remove leftover untracked cruft files at root ────────────────
echo "─── 4/6 Removing leftover untracked cruft ───"
# These are session artefacts that .gitignore now blocks but legacy
# untracked copies may still sit on disk.
for pattern in \
  ".tmp-*" \
  "OVERNIGHT_HANDOFF*.md" \
  "AUDIT_COMPLET_*.md" \
  "TEST_SUP-*.md" \
  "bug_audit_*.md" \
  "fr_strings_report*.json" \
  "migration_result.json" \
  "config.json" \
  "scripts/all_targets.txt" \
  "scripts/batch*.txt" \
  "scripts/p.txt" \
  "scripts/pilot_targets.txt" \
  "scripts/targets.txt" \
  "scripts/debug*.mjs" \
  "scripts/extract_fr.mjs" \
  "scripts/fix_missing_t.mjs" \
  "scripts/migrate_fr.mjs" \
  "scripts/*.json.bak" \
  "scripts/SupportPage.tsx.bak"; do
  rm -f $pattern 2>/dev/null
done
rm -rf test-e2e/ 2>/dev/null
echo "  ✓ Untracked cruft removed"
echo

# ── 5. Garbage collect ──────────────────────────────────────────────
echo "─── 5/6 Running git gc ───"
git gc --prune=now --aggressive 2>&1 | tail -3 || true
echo "  ✓ GC done"
echo

# ── 5. Final state ──────────────────────────────────────────────────
echo "─── 6/6 Final state ───"
echo "Local branches:"
git branch -v
echo
echo "Remote branches:"
git branch -r
echo
echo "Worktrees:"
git worktree list
echo
echo "════════════════════════════════════════════════════════════════"
echo "  ✓ Cleanup complete. Only main + mobile-standalone remain."
echo "════════════════════════════════════════════════════════════════"

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
echo "─── 1/5 Pruning git worktrees ───"
git worktree list
echo
for wt in agent-a3389ac3 agent-af6ae3d2 agent-a8c3e1ad cranky-wilbur nice-meitner-b88549; do
  path=".claude/worktrees/$wt"
  if [ -d "$path" ]; then
    echo "  Removing worktree: $path"
    git worktree remove --force "$path" 2>&1 || echo "    (skipped — likely already removed)"
  fi
done
git worktree prune
echo "  ✓ Worktrees cleaned"
echo

# ── 2. Delete local branches except main + mobile-standalone ─────────
echo "─── 2/5 Deleting local branches ───"
KEEP="^(main|mobile-standalone)$"
for b in $(git branch --format='%(refname:short)' | grep -vE "$KEEP"); do
  echo "  Deleting local branch: $b"
  git branch -D "$b"
done
echo "  ✓ Local branches cleaned"
echo

# ── 3. Delete remote branches except main + mobile-standalone ────────
echo "─── 3/5 Deleting remote branches ───"
git fetch origin --prune
for b in $(git branch -r --format='%(refname:short)' | grep -v 'HEAD' | sed 's|^origin/||' | grep -vE "$KEEP"); do
  echo "  Deleting remote branch: origin/$b"
  git push origin --delete "$b" || echo "    (failed — branch may be protected)"
done
echo "  ✓ Remote branches cleaned"
echo

# ── 4. Garbage collect ──────────────────────────────────────────────
echo "─── 4/5 Running git gc ───"
git gc --prune=now --aggressive 2>&1 | tail -3 || true
echo "  ✓ GC done"
echo

# ── 5. Final state ──────────────────────────────────────────────────
echo "─── 5/5 Final state ───"
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

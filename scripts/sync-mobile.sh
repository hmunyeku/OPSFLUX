#!/bin/bash
#
# sync-mobile.sh — Mirror apps/mobile from hmunyeku/OPSFLUX:mobile-standalone
#                  to hmunyeku/opsflux-mobile:main.
#
# Use this whenever the mobile code is updated on the monorepo side
# and you want to push those changes to the standalone opsflux-mobile repo.
#
# Usage:
#   ./scripts/sync-mobile.sh
#
# After running, pull in your local opsflux-mobile working copy:
#   cd ~/Desktop/opsflux/opsflux-mobile && git pull
#

set -euo pipefail

SOURCE_REPO="https://github.com/hmunyeku/OPSFLUX.git"
SOURCE_BRANCH="mobile-standalone"
TARGET_REPO="https://github.com/hmunyeku/opsflux-mobile.git"
TARGET_BRANCH="main"

echo "▶ Syncing $SOURCE_BRANCH → opsflux-mobile:$TARGET_BRANCH"

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

git clone --single-branch -b "$SOURCE_BRANCH" --depth 50 "$SOURCE_REPO" "$TMP" >/dev/null 2>&1

cd "$TMP"

git remote set-url origin "$TARGET_REPO"
git branch -m "$SOURCE_BRANCH" "$TARGET_BRANCH"

# Force push because the histories are rewritten by git-subtree on each sync
git push -f origin "$TARGET_BRANCH"

echo "✓ opsflux-mobile:$TARGET_BRANCH updated"
echo ""
echo "Next step — pull in your local working copy:"
echo "  cd ~/Desktop/opsflux/opsflux-mobile && git pull --rebase"

#!/bin/bash
# OPSFLUX Agent Runner — root-privileged bootstrap.
#
# Runs BEFORE entrypoint.sh, as root. Its only job is to guarantee
# that /home/agent/.claude is owned by the `agent` user (uid 1001)
# with mode 700, then drop privileges to `agent` and exec the real
# entrypoint.
#
# Why this exists: even with the Dockerfile pre-creating the dir
# with the right ownership, a stale anonymous volume, a compose
# bind-mount, or a legacy image layer can leave it root-owned.
# Without this script, Claude Code silently fails with EACCES on
# every Bash call — no clone, no commit, no PR — and 5 runs later
# the supervision circuit breaker trips.
#
# This script is idempotent and self-healing: it's cheap to run on
# every container start.
set -euo pipefail

CLAUDE_HOME="/home/agent/.claude"

echo "[bootstrap $(date -Is)] ensuring ${CLAUDE_HOME} writable by agent(1001)" | tee -a /var/log/agent/stdout.log 2>/dev/null || true

# Create if missing (paranoid — should already exist from Dockerfile).
mkdir -p "${CLAUDE_HOME}/session-env"

# Re-assert ownership + mode on EVERY start. Running as root here,
# so this always succeeds — even on a stale root-owned volume.
chown -R agent:agent "${CLAUDE_HOME}"
chmod 700 "${CLAUDE_HOME}"
chmod 700 "${CLAUDE_HOME}/session-env"

# Also make sure /var/log/agent is writable by the agent user when
# mounted from the host (Dokploy mounts it as root:root by default).
if [ -d /var/log/agent ]; then
    chown -R agent:agent /var/log/agent 2>/dev/null || true
fi

# Drop to agent and hand off. `exec` so the agent process gets PID 1
# (proper signal handling), `gosu` so we don't fork a shell around it.
exec gosu agent /entrypoint.sh "$@"

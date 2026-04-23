#!/bin/bash
# OPSFLUX Agent Runner entrypoint.
#
# Expected environment variables (set by the worker daemon):
#   RUN_ID                  — UUID of the SupportAgentRun
#   AGENT_RUNNER_TYPE       — claude_code | codex
#   AGENT_AUTH_MODE         — api_key | subscription_login
#   ANTHROPIC_API_KEY       — when AGENT_RUNNER_TYPE=claude_code + AGENT_AUTH_MODE=api_key
#   OPENAI_API_KEY          — when AGENT_RUNNER_TYPE=codex
#   GITHUB_TOKEN            — fresh installation token (TTL 1h)
#   MODEL_PREFERENCE        — claude-opus-4-7 | gpt-5-codex | ...
#   MAX_WALL_TIME_SECONDS   — hard kill timer
#   ALLOWED_TOOLS_LIST      — passed to `claude --allowed-tools`
#
# Expected layout:
#   /workspace              — worktree + MISSION.md (read/write)
#   /var/log/agent          — stdout + stream-json log (write-only)
#
# Produces /workspace/REPORT.json on exit (success or failure).
set -uo pipefail

cd /workspace

log() { echo "[entrypoint $(date -Is)] $*" | tee -a /var/log/agent/stdout.log; }

log "=== OPSFLUX Agent Runner ==="
log "Run ID: ${RUN_ID:-?}"
log "Runner type: ${AGENT_RUNNER_TYPE:-?}"
log "Auth mode: ${AGENT_AUTH_MODE:-?}"
log "Model: ${MODEL_PREFERENCE:-?}"
log "Wall-time limit: ${MAX_WALL_TIME_SECONDS:-1800}s"

# ── GitHub auth for `gh pr create` ────────────────────────────────
if [ -n "${GITHUB_TOKEN:-}" ]; then
    gh auth login --with-token <<< "$GITHUB_TOKEN" 2>&1 | tee -a /var/log/agent/stdout.log
    git config --global user.email "agent@opsflux.io"
    git config --global user.name "OpsFlux Maintenance Agent"
else
    log "WARNING: GITHUB_TOKEN not set, PR creation will fail"
fi

# ── Bail out if no MISSION.md ─────────────────────────────────────
if [ ! -f /workspace/MISSION.md ]; then
    log "ERROR: /workspace/MISSION.md missing"
    echo '{"status":"failed","failure_reason":"NO_MISSION","phases_completed":[]}' > /workspace/REPORT.json
    exit 2
fi

MISSION_CONTENT=$(cat /workspace/MISSION.md)

# ── Dispatch by runner ────────────────────────────────────────────
case "${AGENT_RUNNER_TYPE:-}" in
    claude_code)
        log "Launching Claude Code…"
        timeout "${MAX_WALL_TIME_SECONDS:-1800}" claude \
            --output-format stream-json \
            --allowed-tools "${ALLOWED_TOOLS_LIST:-Read Edit Write Glob Grep Bash(git:*) Bash(gh:*) Bash(pytest:*) Bash(npm:*) Bash(pip:*)}" \
            --max-turns 100 \
            --model "${MODEL_PREFERENCE:-claude-sonnet-4-5}" \
            -p "$MISSION_CONTENT" \
            2>&1 | tee -a /var/log/agent/stream.jsonl
        AGENT_EXIT=${PIPESTATUS[0]}
        ;;

    codex)
        log "Launching Codex…"
        timeout "${MAX_WALL_TIME_SECONDS:-1800}" codex exec \
            --json \
            --full-auto \
            --model "${MODEL_PREFERENCE:-gpt-5-codex}" \
            "$MISSION_CONTENT" \
            2>&1 | tee -a /var/log/agent/stream.jsonl
        AGENT_EXIT=${PIPESTATUS[0]}
        ;;

    *)
        log "ERROR: Unknown AGENT_RUNNER_TYPE='$AGENT_RUNNER_TYPE'"
        echo '{"status":"failed","failure_reason":"UNKNOWN_RUNNER","phases_completed":[]}' > /workspace/REPORT.json
        exit 2
        ;;
esac

log "Agent CLI exited with code $AGENT_EXIT"

# ── Guarantee a REPORT.json exists on exit ────────────────────────
if [ ! -f /workspace/REPORT.json ]; then
    log "WARNING: agent did not produce REPORT.json, synthesising one"
    cat > /workspace/REPORT.json <<JSON
{
  "status": "failed",
  "failure_reason": "NO_REPORT",
  "phases_completed": [],
  "root_cause": "Agent exited without writing REPORT.json",
  "metrics": {
    "total_tokens_used": 0,
    "wall_time_seconds": 0,
    "iterations_required": 0
  },
  "reasoning_summary": "The agent ran but no report was produced. Exit code: $AGENT_EXIT",
  "warnings": []
}
JSON
fi

log "Exit."
exit "$AGENT_EXIT"

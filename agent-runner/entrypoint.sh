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
        # Three supported auth modes:
        #   - CLAUDE_CODE_OAUTH_TOKEN set → subscription auth (Pro/Max).
        #     No billing required beyond the user's subscription.
        #   - ANTHROPIC_API_KEY set → pay-per-token. Billing via the
        #     Anthropic console credits.
        #   - Neither → the user has mounted /home/agent/.claude with
        #     a pre-logged-in session.
        if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
            log "Auth: using CLAUDE_CODE_OAUTH_TOKEN (subscription)"
        elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
            log "Auth: using ANTHROPIC_API_KEY (pay-per-token)"
        else
            log "Auth: relying on mounted ~/.claude session"
        fi

        log "Launching Claude Code…"
        # Claude Code rejects `--output-format stream-json` alongside
        # `-p/--print` without `--verbose`. The stream-json format is
        # what we parse later, so `--verbose` is required.
        #
        # Retry wrapper around transient Anthropic failures (429 rate
        # limit, 503 overloaded, 5xx gateway errors). Claude Code does
        # NOT retry these internally when invoked with -p, so without
        # this wrapper a 1-second rate limit blip kills a 5-minute
        # agent run. We retry up to AGENT_MAX_RETRIES times with
        # exponential backoff: 15s, 45s, 90s. Each retry gets a fresh
        # MISSION prompt and the remaining wall-time budget.
        MAX_RETRIES=${AGENT_MAX_RETRIES:-3}
        BACKOFFS=(15 45 90)
        ATTEMPT=0
        START_TS=$(date +%s)
        TOTAL_BUDGET=${MAX_WALL_TIME_SECONDS:-1800}
        AGENT_EXIT=1
        while [ "$ATTEMPT" -le "$MAX_RETRIES" ]; do
            ATTEMPT=$((ATTEMPT + 1))
            ELAPSED=$(($(date +%s) - START_TS))
            REMAINING=$((TOTAL_BUDGET - ELAPSED))
            if [ "$REMAINING" -le 30 ]; then
                log "Wall-time budget nearly exhausted ($REMAINING s left) — aborting retries"
                break
            fi
            [ "$ATTEMPT" -gt 1 ] && log "Attempt $ATTEMPT/$((MAX_RETRIES+1)) (remaining budget: ${REMAINING}s)"

            timeout "$REMAINING" claude \
                --output-format stream-json \
                --verbose \
                --allowed-tools "${ALLOWED_TOOLS_LIST:-Read Edit Write Glob Grep Bash TodoWrite Task WebFetch}" \
                --max-turns 100 \
                --model "${MODEL_PREFERENCE:-claude-sonnet-4-5}" \
                -p "$MISSION_CONTENT" \
                2>&1 | tee -a /var/log/agent/stream.jsonl
            AGENT_EXIT=${PIPESTATUS[0]}

            if [ "$AGENT_EXIT" -eq 0 ]; then
                break
            fi

            # Grep the last 200 lines of the stream for the transient
            # signatures we actually want to retry on. Other exit
            # codes (mission error, tool EACCES, etc.) are permanent —
            # retrying would just waste budget.
            LAST_CHUNK=$(tail -n 200 /var/log/agent/stream.jsonl 2>/dev/null || true)
            if echo "$LAST_CHUNK" | grep -qE '"status":(429|503|502|504)|rate_limit_error|overloaded_error|Service Unavailable'; then
                BACKOFF_IDX=$((ATTEMPT - 1))
                [ "$BACKOFF_IDX" -ge "${#BACKOFFS[@]}" ] && BACKOFF_IDX=$((${#BACKOFFS[@]} - 1))
                BACKOFF=${BACKOFFS[$BACKOFF_IDX]}
                log "Transient Anthropic error detected (exit=$AGENT_EXIT) — sleeping ${BACKOFF}s before retry"
                sleep "$BACKOFF"
                continue
            fi

            log "Non-retryable error (exit=$AGENT_EXIT) — aborting"
            break
        done
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

# OPSFLUX Agent Worker Pool

Companion compose project for the autonomous maintenance agent feature.
Keeps the worker daemon isolated from the main OPSFLUX stack so a broken
worker build can't take down the API, and so installs that don't want
the agent never build its image.

## What it does

Each replica:

1. Registers itself in the `agent_worker_pool` table on start-up.
2. Sends a heartbeat every 30 s.
3. Polls `support_agent_runs` for rows in `status = 'pending'` and
   claims them atomically via `FOR UPDATE SKIP LOCKED`.
4. For each claimed run:
   - Prepares a host worktree at `/var/opsflux/agent-runs/<run_id>`
     and writes the MISSION.md the harness generated.
   - Pulls `ghcr.io/hmunyeku/opsflux-agent-runner:latest` and launches
     it with `TARGET_URL`-free env (runner-side env: API keys, model
     preference, wall-time limit…).
   - Streams the container's JSON log into
     `/var/log/opsflux-agent/<run_id>/`.
   - Reads `REPORT.json` when the container exits, updates the
     `SupportAgentRun` row, then calls
     `POST /support/agent/runs/{id}/post-exec` on the backend so the
     gate suite runs.
5. Gracefully drains on SIGTERM.

## Deploy

Once the main OPSFLUX stack is up, create a **second Dokploy Docker
Compose project** inside the same parent project pointing at:

```
agent-worker/docker-compose.yml
```

Paste these env vars — they **must** match what the main OPSFLUX
backend uses:

| Var | Source |
|-----|--------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | same as main project |
| `ENCRYPTION_KEY` | same as main project (decrypts integration credentials) |
| `OPSFLUX_INTERNAL_TOKEN` | same as main project (auth for `/post-exec` callback) |

Everything else has sane defaults.

Hit **Deploy**. Each replica auto-registers and starts claiming runs.

## Scaling

Edit `deploy.replicas` in `docker-compose.yml`. Default is 2.

Each worker handles one run at a time (the spec caps
`max_parallel_runs = 1`). More replicas = more concurrent runs, not
faster individual runs.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Runs stay `pending` forever | `docker logs opsflux-agent-workers-worker-1` — worker might be crashing on DB connect. Verify `POSTGRES_PASSWORD` matches. |
| "Failed to decrypt integration credentials" | `ENCRYPTION_KEY` differs from main project. Must be byte-identical. |
| `post-exec` calls return 401 | `OPSFLUX_INTERNAL_TOKEN` differs. Backend must set the same value. |
| Child runner containers not spawning | Docker socket not mounted, or host filesystem `/var/opsflux/agent-runs` not writable by UID 1001 inside the container. |

## Local development

For a one-off test against a locally running OPSFLUX stack:

```bash
cd agent-worker
export DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/opsflux
export ENCRYPTION_KEY=...
export OPSFLUX_INTERNAL_TOKEN=...
docker compose up --build
```

The daemon will register as `worker-<hostname>-<pid>` and poll the local
DB.

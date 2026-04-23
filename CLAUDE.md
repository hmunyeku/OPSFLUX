# OpsFlux — Claude agent notes

## Commit conventions

**Never add a `Co-Authored-By: Claude ...` trailer to commit messages.**
The user has explicitly opted out. Plain commit messages only — subject
line + body, nothing else at the end.

## Deploy

- Dokploy API: `http://72.60.188.156:3000/api/compose.deploy`
- Token env var: `API_DOKPLOY` (in `.env` — parse with grep/cut, do NOT
  `source .env` because some values contain shell-special chars).
- Compose ID env var: `DOKPLOY_COMPOSE_ID`.
- Status check: `GET /api/compose.one?composeId=<ID>` → field
  `composeStatus` (`done`/`error`/`running`).

## Test account

- Frontend: `https://app.opsflux.io`
- Backend:  `https://api.opsflux.io`
- Login:    `admin@opsflux.io` / `RldgAHGJqlrq6TRjsZq3is`

## Build validation

Before committing a non-trivial frontend change: run `npx tsc --noEmit`
inside `apps/main/`. It catches errors the runtime would otherwise only
surface once Dokploy failed the build.

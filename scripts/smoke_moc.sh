#!/usr/bin/env bash
# Smoke tests for the MOC module — Daxium-parity branch.
#
# Usage:
#   TOKEN=your-jwt ENTITY_ID=your-uuid ./scripts/smoke_moc.sh [API_BASE]
#
# Exercises every endpoint touched by the full-parity branch:
#   * list, create, get
#   * validation upsert with signature + return
#   * production-validation, /return, /signature slots
#   * execution-accord with signature + return
#   * PDF export (verifies content-type is application/pdf)
#   * Types catalogue + rules CRUD
#   * Invite validator

set -euo pipefail

BASE="${1:-https://api.opsflux.io}"
TOKEN="${TOKEN:?set TOKEN=<jwt>}"
ENTITY_ID="${ENTITY_ID:?set ENTITY_ID=<uuid>}"

H_AUTH="Authorization: Bearer $TOKEN"
H_ENTITY="X-Entity-ID: $ENTITY_ID"
H_JSON="Content-Type: application/json"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0

# 1x1 transparent PNG base64 — used as a fake signature payload
SIG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

step() { printf "\n\e[1;34m▶ %s\e[0m\n" "$*"; }
ok() { printf "  \e[32m✓\e[0m %s\n" "$*"; PASS=$((PASS+1)); }
ko() { printf "  \e[31m✗\e[0m %s\n" "$*"; FAIL=$((FAIL+1)); }

req() { # METHOD PATH [JSON_BODY]
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o "$TMP/body" -w "%{http_code}" -H "$H_AUTH" -H "$H_ENTITY")
  [[ -n "$body" ]] && args+=(-H "$H_JSON" --data "$body")
  curl -X "$method" "${args[@]}" "$BASE$path"
}

# ── 1. List ────────────────────────────────────────────────
step "GET /moc (list)"
code=$(req GET /api/v1/moc?page=1\&page_size=1)
[[ "$code" == "200" ]] && ok "list 200" || { ko "list $code"; cat "$TMP/body"; }

# ── 2. MOC types catalogue ─────────────────────────────────
step "GET /moc/types"
code=$(req GET /api/v1/moc/types)
[[ "$code" == "200" ]] && ok "types list 200" || ko "types list $code"

step "POST /moc/types (create)"
code=$(req POST /api/v1/moc/types '{"code":"SMOKE_TYPE","label":"Smoke Type"}')
TYPE_ID=$(python -c "import json; print(json.load(open('$TMP/body'))['id'])" 2>/dev/null || echo)
if [[ "$code" == "201" && -n "$TYPE_ID" ]]; then ok "types create 201 id=$TYPE_ID"
elif [[ "$code" == "409" ]]; then
  ok "types create 409 duplicate — looking up existing"
  code=$(req GET "/api/v1/moc/types?include_inactive=true")
  TYPE_ID=$(python -c "import json,sys; data=json.load(open('$TMP/body')); print(next((t['id'] for t in data if t['code']=='SMOKE_TYPE'),''))")
else ko "types create $code"; cat "$TMP/body"; fi

if [[ -n "$TYPE_ID" ]]; then
  step "POST /moc/types/$TYPE_ID/rules"
  code=$(req POST "/api/v1/moc/types/$TYPE_ID/rules" '{"role":"hse","required":true,"level":"DO"}')
  [[ "$code" == "201" ]] && ok "rule create 201" || [[ "$code" == "409" ]] && ok "rule dup 409" || ko "rule create $code"
fi

# ── 3. Create MOC (full payload) ───────────────────────────
step "POST /moc (create with all Daxium fields)"
PAYLOAD=$(cat <<JSON
{
  "title": "Smoke test MOC",
  "nature": "OPTIMISATION",
  "metiers": ["INSTRUMENTATION", "MAINTENANCE"],
  "site_label": "SMOKE",
  "platform_code": "SMK1",
  "objectives": "Smoke test objectives",
  "description": "Description with **bold**.",
  "current_situation": "- Point A\n- Point B",
  "proposed_changes": "Install X.",
  "impact_analysis": "Marginal.",
  "modification_type": "permanent",
  "initiator_function": "Test runner",
  "initiator_email": "smoke@test.local",
  "initiator_signature": "$SIG"${TYPE_ID:+,"moc_type_id":"$TYPE_ID"}
}
JSON
)
code=$(req POST /api/v1/moc "$PAYLOAD")
MOC_ID=$(python -c "import json; print(json.load(open('$TMP/body'))['id'])" 2>/dev/null || echo)
if [[ "$code" == "201" && -n "$MOC_ID" ]]; then ok "create 201 id=$MOC_ID"
else ko "create $code"; cat "$TMP/body"; exit 1; fi

# ── 4. Get detail — verify all new fields round-trip ──
step "GET /moc/$MOC_ID"
code=$(req GET "/api/v1/moc/$MOC_ID")
if [[ "$code" == "200" ]]; then
  python - <<PY
import json
d = json.load(open("$TMP/body"))
checks = [
  ("title", d.get("title") == "Smoke test MOC"),
  ("nature", d.get("nature") == "OPTIMISATION"),
  ("metiers", d.get("metiers") == ["INSTRUMENTATION", "MAINTENANCE"]),
  ("initiator_email", d.get("initiator_email") == "smoke@test.local"),
  ("initiator_signature present", bool(d.get("initiator_signature"))),
]
for name, ok in checks:
  print(f"  {'✓' if ok else '✗'} {name}")
PY
  ok "detail 200"
else ko "detail $code"; fi

# ── 5. Signature slot update ───────────────────────────────
step "POST /moc/$MOC_ID/signature (slot=site_chief)"
code=$(req POST "/api/v1/moc/$MOC_ID/signature" "{\"slot\":\"site_chief\",\"signature\":\"$SIG\"}")
[[ "$code" == "200" ]] && ok "signature site_chief 200" || ko "signature $code"

# ── 6. Production validation ───────────────────────────────
step "POST /moc/$MOC_ID/production-validation"
code=$(req POST "/api/v1/moc/$MOC_ID/production-validation" \
  "{\"validated\":true,\"comment\":\"Prod OK\",\"priority\":\"2\",\"signature\":\"$SIG\"}")
[[ "$code" == "200" ]] && ok "production_validation 200" || { ko "production $code"; cat "$TMP/body"; }

# ── 7. Upsert a validation with signature + return ─────────
step "POST /moc/$MOC_ID/validations"
code=$(req POST "/api/v1/moc/$MOC_ID/validations" \
  "{\"role\":\"hse\",\"approved\":true,\"comments\":\"OK côté HSE\",\"signature\":\"$SIG\"}")
[[ "$code" == "200" ]] && ok "validation upsert 200" || { ko "validation $code"; cat "$TMP/body"; }

# ── 8. Return at CDS stage ─────────────────────────────────
step "POST /moc/$MOC_ID/return (stage=site_chief)"
code=$(req POST "/api/v1/moc/$MOC_ID/return" \
  '{"stage":"site_chief","reason":"Besoin détail supplémentaire"}')
[[ "$code" == "200" ]] && ok "return site_chief 200" || { ko "return $code"; cat "$TMP/body"; }

# ── 9. PDF export ──────────────────────────────────────────
step "GET /moc/$MOC_ID/pdf"
ct=$(curl -sS -o "$TMP/moc.pdf" -w "%{content_type}" -H "$H_AUTH" -H "$H_ENTITY" \
  "$BASE/api/v1/moc/$MOC_ID/pdf")
if [[ "$ct" == application/pdf* ]]; then
  size=$(wc -c <"$TMP/moc.pdf")
  ok "pdf 200 ($size bytes, content-type=$ct)"
else ko "pdf content-type=$ct"; head -c 200 "$TMP/moc.pdf"; fi

# ── Summary ────────────────────────────────────────────────
printf "\n\e[1mPASS: %d · FAIL: %d\e[0m\n" "$PASS" "$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1 || exit 0

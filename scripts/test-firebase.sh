#!/usr/bin/env bash
#
# Firebase Test Lab — Robo Crawler runner for the OpsFlux Android APK.
#
# Uploads the most recent APK from EAS (or a local one if --apk is given)
# to Firebase Test Lab, runs the Robo Crawler on a matrix of real Android
# devices, and prints the result URL.
#
# Requirements (one-off setup):
#   1. gcloud CLI installed:           https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login + gcloud config set project <PROJECT_ID>
#   3. Firebase Test Lab API enabled:
#      gcloud services enable testing.googleapis.com toolresults.googleapis.com
#
# Env vars:
#   GCP_PROJECT     GCP project ID (default: read from `gcloud config`)
#   APK_PATH        local path to APK; if omitted, tries to download the
#                   latest EAS preview build for the current branch
#   ROBO_TIMEOUT    crawler max duration (default: 240s)
#   DEVICE_MODEL    AVD model id (default: redfin = Pixel 5)
#   DEVICE_VERSION  Android API level (default: 30)
#   ROBO_LOGIN_USER admin@opsflux.io (optional — passed as Robo script)
#   ROBO_LOGIN_PWD  the password — DO NOT hardcode in this file
#
# Usage:
#   ./scripts/test-firebase.sh
#   ./scripts/test-firebase.sh --apk /path/to/app.apk
#   APK_PATH=./app.apk ./scripts/test-firebase.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK_PATH="${APK_PATH:-}"
ROBO_TIMEOUT="${ROBO_TIMEOUT:-240}"
DEVICE_MODEL="${DEVICE_MODEL:-redfin}"
DEVICE_VERSION="${DEVICE_VERSION:-30}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk) APK_PATH="$2"; shift 2 ;;
    --device) DEVICE_MODEL="$2"; shift 2 ;;
    --version) DEVICE_VERSION="$2"; shift 2 ;;
    --timeout) ROBO_TIMEOUT="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,30p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ── Detect or download the APK ─────────────────────────────────────
if [[ -z "$APK_PATH" ]]; then
  echo "→ No --apk given, trying to fetch latest EAS preview build..."
  if ! command -v eas >/dev/null 2>&1; then
    if ! command -v npx >/dev/null 2>&1; then
      echo "  npx not found — install Node.js first" >&2
      exit 1
    fi
    EAS="npx eas-cli@latest"
  else
    EAS="eas"
  fi
  cd "$ROOT/apps/mobile"
  # Get the most recent preview build's URL
  BUILD_URL=$($EAS build:list --platform android --status=finished --limit=1 --json --non-interactive 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['artifacts']['buildUrl'] if d else '')")
  if [[ -z "$BUILD_URL" ]]; then
    echo "  No finished EAS build found. Run: cd apps/mobile && eas build --profile preview --platform android" >&2
    exit 1
  fi
  APK_PATH="$ROOT/.cache/opsflux-preview.apk"
  mkdir -p "$(dirname "$APK_PATH")"
  echo "→ Downloading $BUILD_URL"
  curl -fLsS "$BUILD_URL" -o "$APK_PATH"
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found at $APK_PATH" >&2
  exit 1
fi

echo "→ Using APK: $APK_PATH ($(du -h "$APK_PATH" | cut -f1))"

# ── Verify gcloud is configured ─────────────────────────────────────
if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI not installed. https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

GCP_PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$GCP_PROJECT" ]]; then
  echo "Set GCP_PROJECT or run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

echo "→ GCP project: $GCP_PROJECT"
echo "→ Device matrix: model=$DEVICE_MODEL, version=$DEVICE_VERSION, locale=fr, orientation=portrait"
echo "→ Robo timeout: ${ROBO_TIMEOUT}s"

# ── Optional Robo script for auto-login ─────────────────────────────
ROBO_SCRIPT_ARG=""
if [[ -n "${ROBO_LOGIN_USER:-}" && -n "${ROBO_LOGIN_PWD:-}" ]]; then
  TMP_SCRIPT="$ROOT/.cache/robo-script.json"
  mkdir -p "$(dirname "$TMP_SCRIPT")"
  cat > "$TMP_SCRIPT" <<EOF
[
  { "eventType": "VIEW_TEXT_CHANGED", "elementDescriptors": [{"resourceId": "email_input"}], "replacementText": "${ROBO_LOGIN_USER}" },
  { "eventType": "VIEW_TEXT_CHANGED", "elementDescriptors": [{"resourceId": "password_input"}], "replacementText": "${ROBO_LOGIN_PWD}" },
  { "eventType": "VIEW_CLICKED",       "elementDescriptors": [{"resourceId": "submit_button"}] }
]
EOF
  ROBO_SCRIPT_ARG="--robo-script=$TMP_SCRIPT"
  echo "→ Robo script: $TMP_SCRIPT (auto-login as ${ROBO_LOGIN_USER})"
fi

# ── Launch the test ─────────────────────────────────────────────────
echo "→ Launching Firebase Test Lab Robo Crawler..."
gcloud firebase test android run \
  --type=robo \
  --app="$APK_PATH" \
  --device="model=$DEVICE_MODEL,version=$DEVICE_VERSION,locale=fr,orientation=portrait" \
  --timeout="${ROBO_TIMEOUT}s" \
  --project="$GCP_PROJECT" \
  $ROBO_SCRIPT_ARG \
  --no-record-video=false \
  || echo "(Robo finished with non-zero exit — check the result URL above for details)"

echo ""
echo "Open the Firebase console to inspect crashes, screenshots and video:"
echo "  https://console.firebase.google.com/project/$GCP_PROJECT/testlab/histories"

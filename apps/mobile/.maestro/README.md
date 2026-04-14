# Maestro tests for the OpsFlux mobile app

End-to-end UI flows tested against a running APK on an emulator or
real device. We use Maestro because:

- YAML is readable to non-engineers (PMs can review test scenarios)
- Single binary, no Appium/WebDriver setup
- Native iOS + Android support
- Records video and screenshots out of the box
- Runs locally OR on Maestro Cloud OR via Firebase Test Lab

## Setup

Install Maestro once:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Start an Android emulator (or plug in a device with USB debugging on),
then install the OpsFlux APK:

```bash
adb install ~/Downloads/opsflux-preview.apk
```

## Run

```bash
cd apps/mobile

# Single test
maestro test .maestro/01-login-email.yaml \
  --env LOGIN_EMAIL=admin@opsflux.io \
  --env LOGIN_PASSWORD='RldgAHGJqlrq6TRjsZq3is'

# All tests sequentially
maestro test .maestro/

# With overrides for the prod build
APP_ID=com.opsflux.mobile maestro test .maestro/
```

## On Firebase Test Lab

Maestro flows can be uploaded as a "robo script" to Test Lab — see
`scripts/test-firebase.sh`. Or use Maestro's own cloud runner:

```bash
maestro cloud --apk ~/Downloads/opsflux-preview.apk .maestro/
```

## Tests included

| File | What it covers |
|---|---|
| `01-login-email.yaml`     | Email/password login → portal home |
| `02-pairing-qr.yaml`      | "Scanner un QR" → camera → back button |
| `03-create-ads.yaml`      | Open the ADS create form, fill step 1 |
| `04-verifications-hub.yaml` | Settings → Vérifications → tiles + drill-down |

## Adding a new flow

1. Pick the next prefix (`05-…`).
2. Use `maestro studio` to record interactively, then save the YAML.
3. Replace any hard-coded text with `${VAR}` and document in the test
   plan above.
4. Keep flows under 60 seconds — break larger journeys into composable
   steps with `runScript` if needed.

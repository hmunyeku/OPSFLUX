# OPSFLUX Playwright runner — executes verification scenarios against
# a target URL produced by a Mode A staging deploy (or Mode B prod).
#
# One container per run. The harness calls it with:
#   TARGET_URL       — URL to point the browser at
#   SCENARIOS_JSON   — /input/scenarios.json (array of scenarios)
#   OUTPUT_DIR       — /output for screenshots, videos and results.json
#
# The entry point `run.mjs` reads SCENARIOS_JSON, eval'uates each
# script in turn against a fresh Chromium context, stores artefacts,
# then writes `/output/results.json` and exits 0.

FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /runner
COPY package.json .
RUN npm install

COPY run.mjs .

ENTRYPOINT ["node", "/runner/run.mjs"]

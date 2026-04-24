# OPSFLUX Agent Runner — headless Claude Code / Codex container.
#
# One container per agent run. The orchestrator (OPSFLUX backend) launches
# this image with a freshly-prepared worktree mounted at /workspace and a
# MISSION.md briefing file already placed inside. The entrypoint invokes
# the configured agent CLI (claude or codex) against that mission, streams
# JSON events to stdout, and produces REPORT.json at exit.
#
# Built and pushed by the GitHub Actions workflow in
# `.github/workflows/agent-runner-image.yml` to ghcr.io/hmunyeku/opsflux-agent-runner.

FROM node:20-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/hmunyeku/OPSFLUX"
LABEL org.opencontainers.image.description="OPSFLUX autonomous maintenance agent runner"
LABEL org.opencontainers.image.licenses="proprietary"

# System essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    ripgrep \
    jq \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI (for `gh pr create`)
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] \
             https://cli.github.com/packages stable main" \
       | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Claude Code + Codex CLIs
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Python tooling
RUN pip install --no-cache-dir --break-system-packages \
    pytest \
    pytest-cov \
    ruff \
    mypy \
    black

# JS tooling
RUN npm install -g eslint prettier typescript @types/node

# TruffleHog for secret scanning post-exec gates
RUN curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh \
    | sh -s -- -b /usr/local/bin

# gosu — minimal, static setuid-safe user-switcher used by the
# bootstrap entrypoint to drop from root → agent AFTER fixing
# permissions at runtime. Without this a redeployed image that
# somehow inherits a root-owned /home/agent/.claude (stale volume,
# legacy layer, sneaky tmpfs) cannot self-heal and every Bash
# invocation by Claude Code fails with EACCES.
RUN set -eux; \
    arch="$(dpkg --print-architecture | awk -F- '{print $NF}')"; \
    curl -fsSL -o /usr/local/bin/gosu \
      "https://github.com/tianon/gosu/releases/download/1.17/gosu-${arch}"; \
    chmod +x /usr/local/bin/gosu; \
    gosu nobody true

# Non-root user
RUN useradd -m -u 1001 -s /bin/bash agent \
    # Pre-create ~/.claude with the right ownership so Claude Code
    # can write its session-env / cache files. The runtime bootstrap
    # below re-asserts ownership on every start as a self-healing
    # safety net.
    && mkdir -p /home/agent/.claude /home/agent/.claude/session-env \
    && chown -R agent:agent /home/agent/.claude \
    && chmod -R 700 /home/agent/.claude

# Mark this image with its build SHA so we can verify which version
# is actually running in production (docker inspect | grep labels).
ARG AGENT_RUNNER_BUILD_SHA=unknown
LABEL org.opencontainers.image.revision="${AGENT_RUNNER_BUILD_SHA}"
ENV AGENT_RUNNER_BUILD_SHA=${AGENT_RUNNER_BUILD_SHA}

# NOTE: deliberately NO `VOLUME ["/home/agent/.claude"]` directive.
# Anonymous volumes default to root-owned, breaking the agent user.

# Entrypoints — we keep the container starting as root so the
# bootstrap can fix /home/agent/.claude perms, then drop privileges
# via gosu before exec'ing the real agent entrypoint.
COPY bootstrap.sh /bootstrap.sh
COPY --chown=agent:agent entrypoint.sh /entrypoint.sh
RUN chmod +x /bootstrap.sh /entrypoint.sh

WORKDIR /workspace
# Deliberately NO `USER agent` — bootstrap.sh switches via gosu.
ENTRYPOINT ["/bootstrap.sh"]

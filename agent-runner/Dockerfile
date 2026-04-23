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

# Non-root user
RUN useradd -m -u 1001 -s /bin/bash agent

# Workspace volume mount point (mounted read-write from host)
USER agent
WORKDIR /workspace

# Volume for Claude Code subscription credentials (optional, only when
# agent_runner auth_method == 'subscription_login')
VOLUME ["/home/agent/.claude"]

# Entrypoint
COPY --chown=agent:agent entrypoint.sh /entrypoint.sh

USER root
RUN chmod +x /entrypoint.sh
USER agent

ENTRYPOINT ["/entrypoint.sh"]

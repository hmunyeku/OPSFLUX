# OPSFLUX Agent Worker — long-running daemon that claims pending agent
# runs from Postgres and launches `opsflux-agent-runner` containers.
#
# Deployed as a separate Dokploy project "opsflux-agent-workers" with N
# replicas. Needs access to:
#   - The OPSFLUX Postgres (DATABASE_URL)
#   - The Docker socket of the host (to launch child containers)
#
# No auth required on top of the DB connection — the daemon is internal.

FROM python:3.13-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (the daemon talks to the host docker socket)
RUN curl -fsSL https://get.docker.com | sh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/worker

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY worker.py .

ENTRYPOINT ["python", "worker.py"]

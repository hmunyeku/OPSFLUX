# Backend Dockerfile — Python 3.12 slim + uvicorn.
# Force-rebuild marker (SUP-0038 followup, 2026-05-11 16:40): backend
# container has been stuck on a stale image after the last few deploys
# (Dokploy was doing 'docker compose up -d' without --build because no
# Dockerfile change was detected). This touch ensures the next deploy
# re-builds the image with the up-to-date Python code.
FROM python:3.12-slim AS base

WORKDIR /opt/opsflux

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    libcairo2 \
    libffi-dev \
    libgdk-pixbuf-2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    shared-mime-info \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Python deps — install from pyproject.toml (need minimal package structure for pip)
COPY pyproject.toml ./
RUN mkdir -p app && touch app/__init__.py \
    && pip install --no-cache-dir ".[dev]" \
    && rm -rf app

# Application code
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY tests/ ./tests/
# Scripts (seed_i18n, etc. — invoked via `python -m scripts.X` at boot)
COPY scripts/ ./scripts/
# Locale files for i18n seed (app namespace)
COPY apps/main/src/locales/ ./apps/main/src/locales/

# Create static directories for volume mount + non-root user
RUN mkdir -p /opt/opsflux/static/avatars /opt/opsflux/static/attachments \
    && useradd -m -r opsflux \
    && chown -R opsflux:opsflux /opt/opsflux
USER opsflux

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

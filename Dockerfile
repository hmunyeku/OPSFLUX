FROM python:3.12-slim AS base

WORKDIR /opt/opsflux

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
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

# Non-root user
RUN useradd -m -r opsflux && chown -R opsflux:opsflux /opt/opsflux
USER opsflux

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

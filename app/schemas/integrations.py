"""Pydantic schemas for heavy integration connectors.

Per-type `config` shapes are defined as discriminated unions so the
frontend always knows which fields to render and the backend validates
on write. Credentials travel in a separate `credentials` dict that the
service layer encrypts before storing — they never reach `config`.

Read responses mask credentials with a short tail (e.g. `****abcd`) so
the admin can distinguish instances without exposing the secret.
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ─── Config shapes per connection type ────────────────────────────────

class GithubConfig(BaseModel):
    """Non-sensitive config for a GitHub connector."""
    auth_method: Literal["github_app", "personal_access_token"]
    repo_owner: str = Field(..., min_length=1, max_length=100)
    repo_name: str = Field(..., min_length=1, max_length=100)
    default_branch: str = Field(default="main", max_length=100)
    # GitHub App fields (None when auth_method = 'pat')
    app_id: str | None = Field(default=None, max_length=50)
    installation_id: str | None = Field(default=None, max_length=50)


class DokployConfig(BaseModel):
    """Non-sensitive config for a Dokploy connector."""
    api_url: str = Field(..., min_length=1, max_length=500)
    project_id: str = Field(..., min_length=1, max_length=100)
    # `application_id` OR `compose_id` — Dokploy has both concepts
    application_id: str | None = Field(default=None, max_length=100)
    compose_id: str | None = Field(default=None, max_length=100)
    environment_label: Literal["staging", "production", "qa", "development", "other"] = "staging"
    health_check_url: str | None = Field(default=None, max_length=500)
    health_check_timeout_seconds: int = Field(default=300, ge=10, le=3600)
    deployment_strategy: Literal["restart", "rolling", "blue_green"] = "restart"

    @field_validator("application_id", "compose_id", mode="before")
    @classmethod
    def _blank_to_none(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.strip():
            return None
        return v


class AgentRunnerConfig(BaseModel):
    """Non-sensitive config for a Claude Code / Codex runner."""
    runner_type: Literal["claude_code", "codex"]
    auth_method: Literal["api_key", "subscription_login"]
    credentials_volume_name: str | None = Field(default=None, max_length=100)
    model_preference: str = Field(..., min_length=1, max_length=100)
    max_tokens_budget_per_run: int = Field(default=200_000, ge=1000, le=5_000_000)
    max_wall_time_seconds: int = Field(default=1800, ge=30, le=7200)
    monthly_budget_usd: float = Field(default=200.0, ge=0.0, le=10_000.0)
    additional_flags: list[str] = Field(default_factory=list)


# ─── Credentials (write-only) ─────────────────────────────────────────

class GithubCredentials(BaseModel):
    """Secrets for a GitHub connector — never returned in read responses."""
    # PAT mode
    token: str | None = None
    # GitHub App mode
    private_key: str | None = None
    webhook_secret: str | None = None


class DokployCredentials(BaseModel):
    api_token: str


class AgentRunnerCredentials(BaseModel):
    # Only populated when auth_method = 'api_key'
    api_key_value: str | None = None


# ─── Requests ─────────────────────────────────────────────────────────

class IntegrationConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connection_type: Literal["github", "dokploy", "agent_runner"]
    name: str = Field(..., min_length=1, max_length=255)
    config: dict[str, Any]
    credentials: dict[str, Any] = Field(default_factory=dict)


class IntegrationConnectionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=255)
    config: dict[str, Any] | None = None
    credentials: dict[str, Any] | None = None
    status: Literal["active", "suspended", "disabled"] | None = None


# ─── Responses ────────────────────────────────────────────────────────

class TestResult(BaseModel):
    ok: bool
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    tested_at: datetime


class IntegrationConnectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    entity_id: UUID
    connection_type: str
    name: str
    config: dict[str, Any]
    status: str
    last_tested_at: datetime | None = None
    last_test_result: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    # Always a masked preview of the primary credential (never raw)
    credentials_preview: dict[str, str] = Field(default_factory=dict)


def mask_secret(secret: str | None) -> str:
    """Return a masked form like `••••abcd` for UI display."""
    if not secret:
        return ""
    if len(secret) <= 8:
        return "•" * len(secret)
    return "••••" + secret[-4:]

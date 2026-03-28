"""Pydantic schemas for support module — tickets, comments, stats."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


# ── Ticket Schemas ────────────────────────────────────────────────────────────


class TicketCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=300)
    description: str | None = None
    ticket_type: str = Field(default="bug")
    priority: str = Field(default="medium")
    source_url: str | None = None
    browser_info: dict | None = None
    tags: list[str] | None = None


class TicketUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    ticket_type: str | None = None
    priority: str | None = None
    status: str | None = None
    assignee_id: UUID | None = None
    resolution_notes: str | None = None
    tags: list[str] | None = None


class TicketRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    reference: str
    title: str
    description: str | None
    ticket_type: str
    priority: str
    status: str
    source_url: str | None
    browser_info: dict | None
    reporter_id: UUID
    assignee_id: UUID | None
    resolved_at: datetime | None
    resolved_by: UUID | None
    closed_at: datetime | None
    resolution_notes: str | None
    tags: list[str] | None
    created_at: datetime
    updated_at: datetime

    # Enriched fields (added by the route)
    reporter_name: str | None = None
    assignee_name: str | None = None
    comment_count: int = 0


# ── Ticket Assignment ─────────────────────────────────────────────────────────


class TicketAssign(BaseModel):
    assignee_id: UUID


class TicketResolve(BaseModel):
    resolution_notes: str | None = None


# ── Comment Schemas ───────────────────────────────────────────────────────────


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1)
    is_internal: bool = False


class CommentRead(OpsFluxSchema):
    id: UUID
    ticket_id: UUID
    author_id: UUID
    body: str
    is_internal: bool
    created_at: datetime
    updated_at: datetime

    author_name: str | None = None


# ── Status History ────────────────────────────────────────────────────────────


class StatusHistoryRead(OpsFluxSchema):
    id: UUID
    ticket_id: UUID
    old_status: str | None
    new_status: str
    changed_by: UUID
    note: str | None
    created_at: datetime

    changed_by_name: str | None = None


# ── Stats ─────────────────────────────────────────────────────────────────────


class TicketStats(BaseModel):
    total: int = 0
    open: int = 0
    in_progress: int = 0
    resolved: int = 0
    closed: int = 0
    by_type: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    avg_resolution_hours: float | None = None
    resolved_this_week: int = 0

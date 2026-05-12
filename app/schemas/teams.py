"""Pydantic schemas for the Teams module."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


TEAM_VISIBILITIES = ("public", "private")
TEAM_MEMBER_ROLES = ("lead", "senior", "member", "observer")
PROJECT_TEAM_ROLES = ("main_team", "support_team", "consulting", "subcontractor")


# ─── Create / Update ──────────────────────────────────────────────────────────


class TeamMemberInitial(BaseModel):
    """Membre initial passe a la creation d'une team (POST /teams).

    Reutilise le pattern XOR user_id/contact_id. Au moins l'un des deux
    doit etre fourni. `role` defaut = 'member'.
    """
    user_id: UUID | None = None
    contact_id: UUID | None = None
    role: str = Field(default="member", pattern=r"^(lead|senior|member|observer)$")

    @model_validator(mode="after")
    def _check_xor(self):
        if bool(self.user_id) == bool(self.contact_id):
            raise ValueError("Fournir exactement un de user_id ou contact_id.")
        return self


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    visibility: str = Field(default="public", pattern=r"^(public|private)$")
    tags: list[str] | None = None
    # Membres initiaux (optionnels) — permet de creer + peupler en 1 appel
    # depuis le formulaire inline (TeamCreateInline).
    initial_members: list[TeamMemberInitial] = Field(default_factory=list)


class TeamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    visibility: str | None = Field(default=None, pattern=r"^(public|private)$")
    active: bool | None = None
    tags: list[str] | None = None


class TeamMemberCreate(BaseModel):
    user_id: UUID | None = None
    contact_id: UUID | None = None
    role: str = Field(default="member", pattern=r"^(lead|senior|member|observer)$")

    @model_validator(mode="after")
    def _check_xor(self):
        if bool(self.user_id) == bool(self.contact_id):
            raise ValueError("Fournir exactement un de user_id ou contact_id.")
        return self


class TeamMemberUpdate(BaseModel):
    role: str = Field(pattern=r"^(lead|senior|member|observer)$")


class TeamMemberMove(BaseModel):
    target_team_id: UUID
    role: str | None = Field(default=None, pattern=r"^(lead|senior|member|observer)$")


# ─── Read ─────────────────────────────────────────────────────────────────────


class TeamMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    team_id: UUID
    user_id: UUID | None
    contact_id: UUID | None
    role: str
    joined_at: datetime
    left_at: datetime | None
    added_by: UUID | None
    moved_to_team_id: UUID | None
    # Enrichi par l'endpoint pour eviter au frontend de re-resoudre :
    pax_source: str | None = None         # 'user' | 'contact'
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    job_position_name: str | None = None
    company_name: str | None = None


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    entity_id: UUID
    name: str
    description: str | None
    visibility: str
    created_by: UUID
    active: bool
    tags: list[Any] | None
    created_at: datetime
    updated_at: datetime
    # Enrichissements :
    created_by_name: str | None = None        # affichage UI sans round-trip
    member_count: int = 0                      # actifs uniquement
    # Liste des membres actifs (omise dans list view, populated dans detail)
    active_members: list[TeamMemberRead] | None = None
    # Historique des membres sortis (detail uniquement)
    past_members: list[TeamMemberRead] | None = None


class TeamSummary(BaseModel):
    """Version legere pour les listes et embeds dans d'autres ressources."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    visibility: str
    member_count: int = 0


# ─── ADS Integration ──────────────────────────────────────────────────────────


class AddTeamToAdsPayload(BaseModel):
    team_id: UUID
    # Si false, les membres deja dans l'ADS (a titre individuel) ne sont
    # pas re-ajoutes/dedupliques — la logique de doublon est en backend.
    # Defaut true : skip silencieux des doublons et report dans le retour.
    skip_duplicates: bool = True


class AddTeamToAdsResult(BaseModel):
    team_id: UUID
    team_name: str
    summary: dict[str, int]   # {total_members, added, skipped, errors}
    added: list[dict] = Field(default_factory=list)
    skipped: list[dict] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)


# ─── Project Integration ──────────────────────────────────────────────────────


class ProjectTeamCreate(BaseModel):
    team_id: UUID
    role: str | None = Field(default=None, pattern=r"^(main_team|support_team|consulting|subcontractor)$")


class ProjectTeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    team_id: UUID
    role: str | None
    attached_at: datetime
    attached_by: UUID | None
    # Enrichissements (team summary, taille):
    team_name: str | None = None
    team_visibility: str | None = None
    team_member_count: int = 0

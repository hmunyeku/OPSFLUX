"""Bump agent default max_lines_modified_per_run 500 -> 2000.

SUP-0038 followup (Bastien, 2026-05-11):
> Pas de changement visible sur le frontend [...] Je ne comprends pas qui
> a fixe la limite a 500 qui a empeche l'agent de faire un travail complet.

L'agent de triage de tickets (OpsFlux Maintenance Agent) lit
``support_agent_configs.max_lines_modified_per_run`` pour:
1. Auto-limiter son scope dans MISSION.md (mission_builder.py:59)
2. Rejeter les PRs depassant le budget (gate_line_budget)

Avec un default a 500 lignes, l'agent rognait systematiquement les
ameliorations UX qu'il jugeait "hors scope". Le bump du server_default
a 2000 permet des PRs substantielles. Le setting reste admin-configurable
dans Parametres > Agent IA > Budgets & securite > Lignes max/run pour les
tenants qui veulent une borne plus basse (audits) ou plus haute (refactors).

Cette migration touche aussi les tenants existants qui sont encore sur
500 (le default) pour qu'ils beneficient du nouveau defaut sans devoir
modifier le setting eux-memes. Les tenants ayant explicitement choisi
une autre valeur (anywhere != 500) ne sont PAS modifies — leur intention
est respectee.

Revision ID: 162_bump_agent_default_max_lines
Revises: 161_add_job_position_to_transfers
Create Date: 2026-05-11
"""
from typing import Sequence, Union

from alembic import op


revision: str = "162_bump_agent_default_max_lines"
down_revision: Union[str, None] = "161_add_job_position_to_transfers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Change the column-level default for new tenants.
    op.alter_column(
        "support_agent_configs",
        "max_lines_modified_per_run",
        server_default="2000",
    )
    # Lift existing tenants stuck on the old default. We deliberately
    # touch ONLY rows still at 500 — if an admin explicitly set 100 or
    # 1500, we keep their value intact.
    op.execute(
        "UPDATE support_agent_configs SET max_lines_modified_per_run = 2000 "
        "WHERE max_lines_modified_per_run = 500"
    )


def downgrade() -> None:
    op.alter_column(
        "support_agent_configs",
        "max_lines_modified_per_run",
        server_default="500",
    )
    # Symmetric rollback: only revert rows still at 2000 (the new default).
    op.execute(
        "UPDATE support_agent_configs SET max_lines_modified_per_run = 500 "
        "WHERE max_lines_modified_per_run = 2000"
    )

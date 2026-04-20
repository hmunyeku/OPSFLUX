"""MOC — rename module-scoped MOC_* roles to generic system roles.

Revision ID: 143_moc_rename_roles
Revises: 142_moc_manager_project

Most MOC role codes describe positions that exist across the OpsFlux
ecosystem (SITE_CHIEF, DIRECTOR, HSE, …), not MOC-specific concepts. We
rename the module codes to the shorter generic name so they can be
reused by other modules without duplication.

Kept module-scoped (not renamed):
  • MOC_INITIATOR — "initiator" is too generic a word; keeping the
    module prefix prevents clashes with paxlog/packlog initiators.
  • MOC_METIER — module-specific discipline validator.
  • MOC_ADMIN — legitimately module admin, not a cross-module position.

Data migration: `user_group_roles.role_code` rows using the old codes are
renamed so existing memberships survive the deploy.
"""

from alembic import op
import sqlalchemy as sa

revision = "143_moc_rename_roles"
down_revision = "142_moc_manager_project"
branch_labels = None
depends_on = None


_RENAMES = [
    ("MOC_SITE_CHIEF", "SITE_CHIEF"),
    ("MOC_DIRECTOR", "DIRECTOR"),
    ("MOC_LEAD_PROCESS", "LEAD_PROCESS"),
    ("MOC_PROCESS_ENGINEER", "PROCESS_ENGINEER"),
    ("MOC_HSE", "HSE"),
    ("MOC_MAINTENANCE_MANAGER", "MAINTENANCE_MANAGER"),
]


def upgrade() -> None:
    conn = op.get_bind()
    for old, new in _RENAMES:
        # Preserve existing assignments: rename the role_code in
        # user_group_roles. ON CONFLICT if the new code already exists
        # (defensive — skip, already migrated).
        conn.execute(
            sa.text(
                """
                UPDATE user_group_roles
                SET role_code = :new
                WHERE role_code = :old
                  AND NOT EXISTS (
                      SELECT 1 FROM user_group_roles ugr2
                      WHERE ugr2.group_id = user_group_roles.group_id
                        AND ugr2.role_code = :new
                  )
                """
            ),
            {"old": old, "new": new},
        )
        # Clean up any leftover old rows whose group already has the new
        # code (duplicate membership).
        conn.execute(
            sa.text(
                "DELETE FROM user_group_roles WHERE role_code = :old"
            ),
            {"old": old},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for old, new in _RENAMES:
        conn.execute(
            sa.text(
                """
                UPDATE user_group_roles
                SET role_code = :old
                WHERE role_code = :new
                  AND NOT EXISTS (
                      SELECT 1 FROM user_group_roles ugr2
                      WHERE ugr2.group_id = user_group_roles.group_id
                        AND ugr2.role_code = :old
                  )
                """
            ),
            {"old": old, "new": new},
        )
        conn.execute(
            sa.text(
                "DELETE FROM user_group_roles WHERE role_code = :new"
            ),
            {"new": new},
        )

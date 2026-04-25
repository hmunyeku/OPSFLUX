"""E2E audit fixes: SoftDelete on transport/voyages, unique settings, seed missing dicts

Addresses several issues discovered during the 2026-04-05 E2E audit:
1. transport_vectors / voyages missing archived + deleted_at columns (SoftDeleteMixin
   declared on the model but migration was never generated).
2. public.settings had no UNIQUE(key, scope) constraint — allowed silent duplicate
   rows (6 found in prod for integration.gouti.*).
3. Missing dictionary entries: visit_category, transport_mode, civility, tier_type,
   mission_type, mission_activity_type, pax_type.

Revision ID: 089_e2e_audit_fixes
Revises: 086_ads_creator_and_initiator_review
Create Date: 2026-04-05
"""

from alembic import op


revision = "089_e2e_audit_fixes"
down_revision = "088_add_mission_visa_and_allowance_followups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. SoftDeleteMixin columns on transport tables ────────────────────
    op.execute("""
        ALTER TABLE transport_vectors
        ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
    """)
    op.execute("""
        ALTER TABLE transport_vectors
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
    """)
    op.execute("""
        ALTER TABLE voyages
        ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
    """)
    op.execute("""
        ALTER TABLE voyages
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
    """)

    # ── 2. Deduplicate and enforce unique (key, scope) on public.settings ──
    op.execute("""
        DELETE FROM public.settings s1
        USING public.settings s2
        WHERE s1.id != s2.id
          AND s1.key = s2.key
          AND COALESCE(s1.scope, '') = COALESCE(s2.scope, '')
          AND COALESCE(s1.updated_at, '1970-01-01'::timestamptz)
              < COALESCE(s2.updated_at, '1970-01-01'::timestamptz);
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_settings_key_scope'
            ) THEN
                ALTER TABLE public.settings
                ADD CONSTRAINT uq_settings_key_scope UNIQUE (key, scope);
            END IF;
        END $$;
    """)

    # ── 3. Seed missing dictionary entries ────────────────────────────────
    op.execute("""
        INSERT INTO public.dictionary_entries (category, code, label, sort_order) VALUES
          ('visit_category', 'project_work', 'Travaux projet', 1),
          ('visit_category', 'maintenance', 'Maintenance', 2),
          ('visit_category', 'inspection', 'Inspection', 3),
          ('visit_category', 'visit', 'Visite', 4),
          ('visit_category', 'permanent_ops', 'Opérations permanentes', 5),
          ('visit_category', 'other', 'Autre', 6),
          ('transport_mode', 'helicopter', 'Hélicoptère', 1),
          ('transport_mode', 'boat', 'Bateau', 2),
          ('transport_mode', 'vehicle', 'Véhicule', 3),
          ('transport_mode', 'plane', 'Avion', 4),
          ('transport_mode', 'walking', 'À pied', 5),
          ('transport_mode', 'other', 'Autre', 6),
          ('civility', 'mr', 'M.', 1),
          ('civility', 'mrs', 'Mme', 2),
          ('civility', 'miss', 'Mlle', 3),
          ('civility', 'dr', 'Dr.', 4),
          ('civility', 'prof', 'Prof.', 5),
          ('tier_type', 'client', 'Client', 1),
          ('tier_type', 'supplier', 'Fournisseur', 2),
          ('tier_type', 'subcontractor', 'Sous-traitant', 3),
          ('tier_type', 'partner', 'Partenaire', 4),
          ('tier_type', 'service_provider', 'Prestataire', 5),
          ('tier_type', 'other', 'Autre', 6),
          ('mission_type', 'standard', 'Standard', 1),
          ('mission_type', 'vip', 'VIP', 2),
          ('mission_type', 'regulatory', 'Réglementaire', 3),
          ('mission_type', 'emergency', 'Urgence', 4),
          ('mission_activity_type', 'visit', 'Visite', 1),
          ('mission_activity_type', 'meeting', 'Réunion', 2),
          ('mission_activity_type', 'inspection', 'Inspection', 3),
          ('mission_activity_type', 'training', 'Formation', 4),
          ('mission_activity_type', 'handover', 'Passation', 5),
          ('mission_activity_type', 'other', 'Autre', 6),
          ('pax_type', 'internal', 'Interne', 1),
          ('pax_type', 'external', 'Externe', 2)
        ON CONFLICT (category, code) DO NOTHING;
    """)


def downgrade() -> None:
    # Remove dictionaries seeded by this migration
    op.execute("""
        DELETE FROM public.dictionary_entries
        WHERE category IN (
            'visit_category', 'transport_mode', 'civility', 'tier_type',
            'mission_type', 'mission_activity_type', 'pax_type'
        );
    """)
    # Drop unique constraint
    op.execute("""
        ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS uq_settings_key_scope;
    """)
    # Drop SoftDelete columns
    op.execute("ALTER TABLE voyages DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE voyages DROP COLUMN IF EXISTS archived;")
    op.execute("ALTER TABLE transport_vectors DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE transport_vectors DROP COLUMN IF EXISTS archived;")

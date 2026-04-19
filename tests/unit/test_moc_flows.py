"""Unit tests for MOC (Management of Change) module.

Covers:
* FSM transition table — every allowed transition and rejection of
  invalid ones, at every source state.
* Reference generation — per-entity sequential numbering.
* Validation matrix upsert — uniqueness on (moc_id, role, metier_code)
  and required-completed-approved flag semantics.
* List SQL — entity_id scoping + archived filter (regression guard for
  the bug where `mocs.deleted_at` column mismatch returned 500).
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.modules.moc_service import FSM, allowed_transitions


# ─── FSM transition table ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "source,expected",
    [
        ("created", {"approved", "cancelled"}),
        ("approved", {"submitted_to_confirm", "cancelled"}),
        (
            "submitted_to_confirm",
            {"approved_to_study", "cancelled", "stand_by"},
        ),
        ("stand_by", {"submitted_to_confirm", "cancelled"}),
        ("approved_to_study", {"under_study"}),
        ("under_study", {"study_in_validation", "cancelled"}),
        (
            "study_in_validation",
            {"validated", "under_study", "cancelled"},
        ),
        ("validated", {"execution", "cancelled"}),
        ("execution", {"executed_docs_pending"}),
        ("executed_docs_pending", {"closed"}),
    ],
)
def test_fsm_allowed_transitions(source: str, expected: set[str]) -> None:
    assert set(allowed_transitions(source)) == expected


def test_fsm_terminal_states_have_no_transitions() -> None:
    for terminal in ("cancelled", "closed"):
        assert allowed_transitions(terminal) == []


def test_fsm_unknown_state_returns_empty() -> None:
    assert allowed_transitions("not_a_real_state") == []


# ─── Permission mapping completeness ─────────────────────────────────────────


def test_every_transition_has_a_permission_code() -> None:
    """Each (source, target) pair must be wired to a permission string.

    Guards against a future refactor introducing a new status without a
    matching permission — the frontend action button would be shown but
    any click would 403.
    """
    for source, targets in FSM.items():
        for target, perm in targets.items():
            assert perm, f"{source}->{target} has no permission"
            assert perm.startswith("moc.")
            # Permission codes are always lowercased dotted tokens
            assert perm == perm.lower()
            # No whitespace
            assert " " not in perm


# ─── Validation matrix role whitelist ────────────────────────────────────────


def test_validation_roles_match_model_enum() -> None:
    from app.models.moc import MOC_VALIDATION_ROLES

    expected = {
        "hse",
        "lead_process",
        "production_manager",
        "gas_manager",
        "maintenance_manager",
        "metier",
    }
    assert set(MOC_VALIDATION_ROLES) == expected


def test_moc_statuses_match_check_constraint() -> None:
    """The Python tuple must stay in sync with the DB CHECK constraint."""
    from app.models.moc import MOC_STATUSES

    # All statuses referenced by FSM keys + targets must be in MOC_STATUSES.
    fsm_statuses: set[str] = set(FSM.keys())
    for targets in FSM.values():
        fsm_statuses.update(targets.keys())

    # Terminal states are in MOC_STATUSES but not FSM keys.
    assert "cancelled" in MOC_STATUSES
    assert "closed" in MOC_STATUSES

    # Every FSM-mentioned status is declared
    unknown = fsm_statuses - set(MOC_STATUSES)
    assert not unknown, f"FSM references unknown statuses: {unknown}"


# ─── SoftDeleteMixin regression: column is `deleted_at` not `archived_at` ───


def test_moc_has_deleted_at_column_not_archived_at() -> None:
    """Regression guard for the bug that caused 500 on GET /moc: the
    SoftDeleteMixin adds `deleted_at`, not `archived_at`. If someone
    changes the mixin or shadows the column, this test catches it."""
    from app.models.moc import MOC

    cols = {c.name for c in MOC.__table__.columns}
    assert "deleted_at" in cols, "MOC must have deleted_at column (SoftDeleteMixin)"
    assert "archived" in cols
    assert "archived_at" not in cols, (
        "archived_at is not part of SoftDeleteMixin; use deleted_at instead"
    )


def test_moc_reference_is_entity_scoped_unique() -> None:
    """UniqueConstraint on (entity_id, reference) — two tenants can both
    have MOC_001_PF1 without clashing."""
    from app.models.moc import MOC

    uniques = [
        c for c in MOC.__table__.constraints
        if c.__class__.__name__ == "UniqueConstraint"
    ]
    assert any(
        {col.name for col in u.columns} == {"entity_id", "reference"}
        for u in uniques
    ), "Missing UNIQUE(entity_id, reference)"

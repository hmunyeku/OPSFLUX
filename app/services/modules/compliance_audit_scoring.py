"""Supplier audit score thresholds and category helpers."""

from __future__ import annotations

from decimal import Decimal
from typing import Any


DEFAULT_AUDIT_SCORE_THRESHOLDS: list[dict[str, Any]] = [
    {"code": "preferred", "label": "Privilégié", "min_score": 90, "color": "success", "blocks_assignment": False},
    {"code": "qualified", "label": "Qualifié", "min_score": 75, "color": "primary", "blocks_assignment": False},
    {"code": "watch", "label": "Sous surveillance", "min_score": 60, "color": "warning", "blocks_assignment": False},
    {"code": "blocked", "label": "Bloqué", "min_score": 0, "color": "danger", "blocks_assignment": True},
]


def normalize_audit_score_thresholds(thresholds: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Return clean supplier categories sorted from highest score to lowest."""
    clean: list[dict[str, Any]] = []
    seen_codes: set[str] = set()
    for index, threshold in enumerate(thresholds or []):
        raw_label = str(threshold.get("label") or "").strip()
        raw_code = str(threshold.get("code") or raw_label or f"level_{index + 1}").strip().lower()
        code = "_".join(part for part in raw_code.replace("-", "_").split("_") if part)
        if not code or code in seen_codes:
            continue
        try:
            min_score = float(threshold.get("min_score", 0))
        except (TypeError, ValueError):
            min_score = 0
        min_score = max(0, min(100, min_score))
        seen_codes.add(code)
        clean.append({
            "code": code,
            "label": raw_label or code.replace("_", " ").title(),
            "min_score": min_score,
            "color": str(threshold.get("color") or "").strip() or None,
            "blocks_assignment": bool(threshold.get("blocks_assignment", False)),
        })
    return sorted(clean, key=lambda item: item["min_score"], reverse=True)


def audit_thresholds_or_default(thresholds: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized = normalize_audit_score_thresholds(thresholds)
    return normalized or normalize_audit_score_thresholds(DEFAULT_AUDIT_SCORE_THRESHOLDS)


def classify_audit_score(
    score: Decimal | float | int | None,
    thresholds: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    if score is None:
        return None
    numeric_score = float(score)
    for threshold in audit_thresholds_or_default(thresholds):
        if numeric_score >= float(threshold["min_score"]):
            return threshold
    return None

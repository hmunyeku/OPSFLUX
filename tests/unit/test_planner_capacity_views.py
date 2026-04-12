from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes.modules import planner
from app.schemas.planner import ForecastRequest
from app.services.modules import planner_service


@pytest.mark.asyncio
async def test_get_heatmap_wraps_days_payload(monkeypatch):
    entity_id = uuid4()
    asset_id = uuid4()
    expected_days = [
        {
            "asset_id": str(asset_id),
            "asset_name": "Site A",
            "date": "2026-04-08",
            "saturation_pct": 62.5,
            "forecast_pax": 10,
            "real_pob": 4,
            "remaining_capacity": 6,
            "capacity_limit": 16,
        }
    ]

    async def fake_get_capacity_heatmap(_db, _entity_id, _start, _end, asset_ids=None):
        assert _entity_id == entity_id
        assert asset_ids == [asset_id]
        return expected_days

    monkeypatch.setattr(
        "app.services.modules.planner_service.get_capacity_heatmap",
        fake_get_capacity_heatmap,
    )

    async def fake_get_capacity_heatmap_config(*_args, **_kwargs):
        return {
            "threshold_low": 40.0,
            "threshold_medium": 70.0,
            "threshold_high": 90.0,
            "threshold_critical": 100.0,
            "color_low": "#86efac",
            "color_medium": "#4ade80",
            "color_high": "#fbbf24",
            "color_critical": "#ef4444",
            "color_overflow": "#991b1b",
        }

    monkeypatch.setattr(planner, "_get_capacity_heatmap_config", fake_get_capacity_heatmap_config)

    payload = await planner.get_heatmap(
        start_date=date(2026, 4, 8),
        end_date=date(2026, 4, 8),
        asset_id=asset_id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=SimpleNamespace(),
    )

    assert payload["days"] == expected_days
    assert payload["config"]["threshold_critical"] == 100.0


@pytest.mark.asyncio
async def test_forecast_capacity_includes_real_pob_summary(monkeypatch):
    async def fake_get_current_capacity(_db, _asset_id, _target):
        return {"max_pax_total": 20}

    async def fake_compute_daily_load(_db, _entity_id, _asset_id, target, include_submitted=True, **kwargs):
        if target == date.today():
            return {"total_used": 8}
        return {"total_used": 10}

    async def fake_count_real_pob(_db, _entity_id, _asset_id, _target):
        return 3

    monkeypatch.setattr(planner_service, "get_current_capacity", fake_get_current_capacity)
    monkeypatch.setattr(planner_service, "compute_daily_load", fake_compute_daily_load)
    monkeypatch.setattr(planner_service, "count_real_pob_for_asset_day", fake_count_real_pob)

    result = await planner_service.forecast_capacity(
        db=SimpleNamespace(),
        entity_id=uuid4(),
        asset_id=uuid4(),
        horizon_days=2,
    )

    assert len(result["forecast"]) == 3
    assert all(day["real_pob"] == 3 for day in result["forecast"])
    assert result["summary"]["avg_real_pob"] == 3.0


@pytest.mark.asyncio
async def test_forecast_route_returns_real_pob_payload(monkeypatch):
    async def fake_forecast_capacity(_db, _entity_id, _asset_id, _horizon_days, **kwargs):
        return {
            "forecast": [
                {
                    "date": "2026-04-08",
                    "projected_load": 7.5,
                    "scheduled_load": 9,
                    "combined_load": 9.0,
                    "real_pob": 4,
                    "max_capacity": 20,
                    "at_risk": False,
                    "saturation_pct": 45.0,
                }
            ],
            "summary": {
                "at_risk_days": 0,
                "avg_projected_load": 9.0,
                "avg_real_pob": 4.0,
                "peak_date": "2026-04-08",
                "peak_load": 9.0,
                "max_capacity": 20,
                "horizon_days": 30,
            },
        }

    monkeypatch.setattr(
        "app.services.modules.planner_service.forecast_capacity",
        fake_forecast_capacity,
    )

    payload = await planner.forecast(
        body=ForecastRequest(asset_id=uuid4(), horizon_days=30),
        entity_id=uuid4(),
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=SimpleNamespace(),
    )

    assert payload["forecast"][0]["real_pob"] == 4
    assert payload["summary"]["avg_real_pob"] == 4.0

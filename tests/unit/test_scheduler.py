from __future__ import annotations

import pytest

from app.tasks import scheduler as scheduler_module


@pytest.mark.asyncio
async def test_start_scheduler_is_idempotent(monkeypatch):
    calls = {
        "register": 0,
        "listener": 0,
        "start": 0,
        "shutdown": 0,
    }

    class DummyScheduler:
        def __init__(self):
            self.running = False

        def add_listener(self, *args, **kwargs):
            calls["listener"] += 1

        def start(self):
            calls["start"] += 1
            self.running = True

        def shutdown(self, wait=False):
            calls["shutdown"] += 1
            self.running = False

    dummy = DummyScheduler()

    def fake_register_jobs():
        calls["register"] += 1

    monkeypatch.setattr(scheduler_module, "scheduler", dummy)
    monkeypatch.setattr(scheduler_module, "_register_jobs", fake_register_jobs)
    monkeypatch.setattr(scheduler_module, "_listeners_registered", False)

    await scheduler_module.start_scheduler()
    await scheduler_module.start_scheduler()
    await scheduler_module.stop_scheduler()

    assert calls["register"] == 1
    assert calls["listener"] == 4
    assert calls["start"] == 1
    assert calls["shutdown"] == 1

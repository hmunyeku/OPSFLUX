from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core import notifications as notifications_module
from app.core.email_templates import _infer_notification_category_from_slug


class _FakeResult:
    def __init__(self, setting):
        self._setting = setting

    def scalar_one_or_none(self):
        return self._setting


class _FakeDb:
    def __init__(self, setting):
        self.setting = setting

    async def execute(self, _query, *_args, **_kwargs):
        return _FakeResult(self.setting)


@pytest.mark.asyncio
async def test_send_email_skips_when_email_channel_disabled(monkeypatch):
    user_id = uuid4()
    db = _FakeDb(
        SimpleNamespace(
            value={
                "notifications_matrix": {
                    "paxlog": {"in_app": True, "email": False, "digest": True},
                }
            }
        )
    )
    called = {"smtp": False}

    async def _fake_get_smtp_config():
        called["smtp"] = True
        return {}

    monkeypatch.setattr(notifications_module, "_get_smtp_config", _fake_get_smtp_config)

    await notifications_module.send_email(
        to="user@example.com",
        subject="Test",
        body_html="<p>x</p>",
        db=db,
        user_id=user_id,
        category="paxlog",
        channel="email",
    )

    assert called["smtp"] is False


@pytest.mark.asyncio
async def test_send_email_skips_when_digest_channel_disabled(monkeypatch):
    user_id = uuid4()
    db = _FakeDb(
        SimpleNamespace(
            value={
                "notifications_matrix": {
                    "core": {"in_app": True, "email": True, "digest": False},
                }
            }
        )
    )
    called = {"smtp": False}

    async def _fake_get_smtp_config():
        called["smtp"] = True
        return {}

    monkeypatch.setattr(notifications_module, "_get_smtp_config", _fake_get_smtp_config)

    await notifications_module.send_email(
        to="user@example.com",
        subject="Digest",
        body_html="<p>x</p>",
        db=db,
        user_id=user_id,
        category="core",
        channel="digest",
    )

    assert called["smtp"] is False


def test_email_template_slug_category_inference_covers_legacy_aliases():
    assert _infer_notification_category_from_slug("ads.submitted") == "ads"
    assert _infer_notification_category_from_slug("ticket_comment") == "support"
    assert _infer_notification_category_from_slug("record_verified") == "conformite"
    assert _infer_notification_category_from_slug("welcome") == "core"
    assert _infer_notification_category_from_slug("paxlog_external_link_otp") is None


def test_notification_module_normalization_covers_slug_aliases():
    assert notifications_module._normalize_notification_module("ads") == "paxlog"
    assert notifications_module._normalize_notification_module("document") == "workflow"
    assert notifications_module._normalize_notification_module("conformite") == "conformite"

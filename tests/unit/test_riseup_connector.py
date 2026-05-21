import asyncio

import pytest

from app.services.connectors import riseup_connector
from app.services.connectors.riseup_connector import RiseUpConnector


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _RedirectAwareClient:
    def __init__(self, **kwargs):
        self.follow_redirects = kwargs.get("follow_redirects") is True

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        if not self.follow_redirects:
            raise AssertionError("Rise Up auth client must follow HTTP redirects")
        assert kwargs["data"] == {
            "grant_type": "client_credentials",
            "client_id": "public",
            "client_secret": "secret",
        }
        return _FakeResponse(200, {"access_token": "token"})

    async def get(self, *args, **kwargs):
        if not self.follow_redirects:
            raise AssertionError("Rise Up API client must follow HTTP redirects")
        return _FakeResponse(200, {"name": "Rise Up Sandbox"})


def test_riseup_connection_follows_http_redirects(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(riseup_connector.httpx, "AsyncClient", _RedirectAwareClient)
    connector = RiseUpConnector({
        "base_url": "http://mock-riseup.example",
        "public_key": "public",
        "secret_key": "secret",
    })

    status, message = asyncio.run(connector.test_connection())

    assert status == "ok"
    assert "Rise Up Sandbox" in message

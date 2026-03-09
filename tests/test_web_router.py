from __future__ import annotations

from pathlib import Path

import pytest


class _SessionService:
    def list_sessions(self):
        return [{"key": "web:default"}]

    def get_session(self, _key: str):
        return {"key": "web:default", "messages": []}

    def delete_session(self, _key: str):
        return True


class _ConfigService:
    def get_public_channels(self):
        return {"web": {"enabled": True}}

    async def update_channels(self, _payload):
        return {
            "applied": True,
            "restart_required_fields": [],
            "reloaded_channels": ["web"],
            "errors": [],
        }


class _ChannelManager:
    enabled_channels = ["web"]

    @staticmethod
    def get_runtime_metrics():
        return {"bus": {"inbound_size": 0, "outbound_size": 0}}


class _LogBuffer:
    @staticmethod
    def snapshot(limit: int = 200):
        return [{"level": "INFO", "message": f"limit={limit}"}]


def test_http_and_websocket_authentication() -> None:
    pytest.importorskip("fastapi")

    from fastapi.testclient import TestClient

    from nanobot.web.connection_manager import ConnectionManager
    from nanobot.web.router import create_router
    from nanobot.web.server import create_app

    seen: list[tuple[str, str]] = []

    async def on_chat_send(chat_id: str, content: str, media, metadata) -> None:
        _ = media, metadata
        seen.append((chat_id, content))

    router = create_router(
        expected_token="token-123",
        connection_manager=ConnectionManager(),
        session_service=_SessionService(),
        config_service=_ConfigService(),
        channel_manager=_ChannelManager(),
        log_buffer=_LogBuffer(),
        on_chat_send=on_chat_send,
    )
    app = create_app(router=router, cors_origins=["*"], static_dir=Path(__file__).parent)
    client = TestClient(app)

    assert client.get("/api/health").status_code == 401
    ok = client.get("/api/health", headers={"Authorization": "Bearer token-123"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "ok"

    with client.websocket_connect("/ws?chat_id=default", subprotocols=["bearer", "token-123"]) as ws:
        first = ws.receive_json()
        assert first["type"] == "status.update"
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"
        ws.send_json({"type": "chat.send", "data": {"chat_id": "default", "content": "hello"}})

    assert seen == [("default", "hello")]

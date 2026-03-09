from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from nanobot.config.schema import Config
from nanobot.web.log_buffer import LogBuffer
from nanobot.web.services import ConfigService


class _StubChannelManager:
    def __init__(self, outcomes: list[tuple[bool, list[str]]] | None = None):
        self.outcomes = outcomes or [(True, [])]
        self.calls = 0
        self.last_cfg = None
        self.enabled_channels = ["web"]

    async def reload_channels(self, cfg):
        self.last_cfg = cfg
        idx = min(self.calls, len(self.outcomes) - 1)
        self.calls += 1
        return self.outcomes[idx]


@pytest.mark.asyncio
async def test_config_service_masks_sensitive_fields(tmp_path: Path) -> None:
    cfg = Config(
        channels={
            "telegram": {"enabled": True, "token": "telegram-secret", "allowFrom": ["*"]},
            "web": {"enabled": True, "authToken": "web-secret", "allowFrom": ["*"]},
        }
    )
    manager = _StubChannelManager()
    service = ConfigService(cfg, tmp_path / "config.json", manager)

    masked = service.get_public_channels()

    assert masked["telegram"]["token"] == "********"
    assert masked["web"]["authToken"] == "********"


@pytest.mark.asyncio
async def test_config_service_update_keeps_masked_secret_and_marks_restart_field(
    tmp_path: Path,
) -> None:
    cfg = Config(
        channels={
            "web": {
                "enabled": True,
                "authToken": "secret-token",
                "allowFrom": ["*"],
                "port": 8080,
            }
        }
    )
    manager = _StubChannelManager()
    service = ConfigService(cfg, tmp_path / "config.json", manager)

    result = await service.update_channels(
        {"channels": {"web": {"authToken": "********", "port": 9090}}}
    )

    assert result["applied"] is True
    assert "channels.web.port" in result["restart_required_fields"]
    assert cfg.channels.web.auth_token == "secret-token"
    assert cfg.channels.web.port == 9090
    assert manager.last_cfg.web.port == 8080  # runtime port unchanged; restart needed


@pytest.mark.asyncio
async def test_config_service_rejects_non_channels_payload(tmp_path: Path) -> None:
    cfg = Config()
    manager = _StubChannelManager()
    service = ConfigService(cfg, tmp_path / "config.json", manager)

    result = await service.update_channels({"providers": {}})

    assert result["applied"] is False
    assert "channels" in result["errors"][0]


@pytest.mark.asyncio
async def test_config_service_rolls_back_when_reload_fails(tmp_path: Path) -> None:
    cfg = Config(
        channels={
            "web": {
                "enabled": True,
                "authToken": "secret-token",
                "allowFrom": ["*"],
                "port": 8080,
            }
        }
    )
    manager = _StubChannelManager(outcomes=[(False, ["reload failed"]), (True, [])])
    service = ConfigService(cfg, tmp_path / "config.json", manager)

    result = await service.update_channels({"channels": {"web": {"allowFrom": ["alice"]}}})

    assert result["applied"] is False
    assert cfg.channels.web.allow_from == ["*"]
    assert manager.calls >= 2


@pytest.mark.asyncio
async def test_log_buffer_snapshot_and_stream() -> None:
    buf = LogBuffer(max_entries=10)
    buf.bind_loop(asyncio.get_running_loop())
    queue = buf.subscribe()
    buf.sink("hello world")

    entry = await asyncio.wait_for(queue.get(), timeout=1.0)
    assert entry["message"] == "hello world"
    assert buf.snapshot(limit=1)[0]["message"] == "hello world"

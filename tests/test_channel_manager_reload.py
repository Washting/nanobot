from __future__ import annotations

from types import SimpleNamespace

import pytest

from nanobot.bus.queue import MessageBus
from nanobot.channels.base import BaseChannel
from nanobot.channels.manager import ChannelManager
from nanobot.config.schema import Config


class _DummyChannel(BaseChannel):
    name = "dummy"

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False

    async def send(self, _msg) -> None:
        return


@pytest.mark.asyncio
async def test_reload_channels_success(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = ChannelManager(Config(), MessageBus())
    dummy = _DummyChannel(SimpleNamespace(allow_from=["*"]), manager.bus)
    monkeypatch.setattr(manager, "_build_channels", lambda _cfg: {"dummy": dummy})

    ok, errors = await manager.reload_channels(manager.config.channels)

    assert ok is True
    assert errors == []
    assert manager.get_channel("dummy") is dummy


@pytest.mark.asyncio
async def test_reload_channels_build_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = ChannelManager(Config(), MessageBus())

    def _boom(_cfg):
        raise RuntimeError("boom")

    monkeypatch.setattr(manager, "_build_channels", _boom)
    ok, errors = await manager.reload_channels(manager.config.channels)

    assert ok is False
    assert "boom" in errors[0]

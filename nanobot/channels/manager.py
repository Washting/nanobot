"""Channel manager for coordinating chat channels."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from loguru import logger

from nanobot.bus.queue import MessageBus
from nanobot.channels.base import BaseChannel
from nanobot.config.loader import get_config_path
from nanobot.config.schema import ChannelsConfig, Config


class ChannelManager:
    """
    Manages chat channels and coordinates message routing.

    Responsibilities:
    - Initialize enabled channels (Telegram, WhatsApp, etc.)
    - Start/stop channels
    - Route outbound messages
    - Hot-reload channels from updated config
    """

    def __init__(
        self,
        config: Config,
        bus: MessageBus,
        *,
        session_manager=None,
        log_buffer=None,
        config_path: Path | None = None,
    ):
        self.config = config
        self.bus = bus
        self.session_manager = session_manager
        self.log_buffer = log_buffer
        self.config_path = config_path or get_config_path()

        self.channels: dict[str, BaseChannel] = {}
        self._channel_tasks: dict[str, asyncio.Task] = {}
        self._dispatch_task: asyncio.Task | None = None
        self._running = False
        self._reload_lock = asyncio.Lock()

        self.channels = self._build_channels(self.config.channels)
        self._validate_allow_from(self.channels)

    def _build_channels(self, channels_cfg: ChannelsConfig) -> dict[str, BaseChannel]:
        channels: dict[str, BaseChannel] = {}

        # Telegram channel
        if channels_cfg.telegram.enabled:
            try:
                from nanobot.channels.telegram import TelegramChannel

                channels["telegram"] = TelegramChannel(
                    channels_cfg.telegram,
                    self.bus,
                    groq_api_key=self.config.providers.groq.api_key,
                )
                logger.info("Telegram channel enabled")
            except ImportError as e:
                logger.warning("Telegram channel not available: {}", e)

        # WhatsApp channel
        if channels_cfg.whatsapp.enabled:
            try:
                from nanobot.channels.whatsapp import WhatsAppChannel

                channels["whatsapp"] = WhatsAppChannel(channels_cfg.whatsapp, self.bus)
                logger.info("WhatsApp channel enabled")
            except ImportError as e:
                logger.warning("WhatsApp channel not available: {}", e)

        # Discord channel
        if channels_cfg.discord.enabled:
            try:
                from nanobot.channels.discord import DiscordChannel

                channels["discord"] = DiscordChannel(channels_cfg.discord, self.bus)
                logger.info("Discord channel enabled")
            except ImportError as e:
                logger.warning("Discord channel not available: {}", e)

        # Feishu channel
        if channels_cfg.feishu.enabled:
            try:
                from nanobot.channels.feishu import FeishuChannel

                channels["feishu"] = FeishuChannel(
                    channels_cfg.feishu,
                    self.bus,
                    groq_api_key=self.config.providers.groq.api_key,
                )
                logger.info("Feishu channel enabled")
            except ImportError as e:
                logger.warning("Feishu channel not available: {}", e)

        # Mochat channel
        if channels_cfg.mochat.enabled:
            try:
                from nanobot.channels.mochat import MochatChannel

                channels["mochat"] = MochatChannel(channels_cfg.mochat, self.bus)
                logger.info("Mochat channel enabled")
            except ImportError as e:
                logger.warning("Mochat channel not available: {}", e)

        # DingTalk channel
        if channels_cfg.dingtalk.enabled:
            try:
                from nanobot.channels.dingtalk import DingTalkChannel

                channels["dingtalk"] = DingTalkChannel(channels_cfg.dingtalk, self.bus)
                logger.info("DingTalk channel enabled")
            except ImportError as e:
                logger.warning("DingTalk channel not available: {}", e)

        # Email channel
        if channels_cfg.email.enabled:
            try:
                from nanobot.channels.email import EmailChannel

                channels["email"] = EmailChannel(channels_cfg.email, self.bus)
                logger.info("Email channel enabled")
            except ImportError as e:
                logger.warning("Email channel not available: {}", e)

        # Slack channel
        if channels_cfg.slack.enabled:
            try:
                from nanobot.channels.slack import SlackChannel

                channels["slack"] = SlackChannel(channels_cfg.slack, self.bus)
                logger.info("Slack channel enabled")
            except ImportError as e:
                logger.warning("Slack channel not available: {}", e)

        # QQ channel
        if channels_cfg.qq.enabled:
            try:
                from nanobot.channels.qq import QQChannel

                channels["qq"] = QQChannel(channels_cfg.qq, self.bus)
                logger.info("QQ channel enabled")
            except ImportError as e:
                logger.warning("QQ channel not available: {}", e)

        # Matrix channel
        if channels_cfg.matrix.enabled:
            try:
                from nanobot.channels.matrix import MatrixChannel

                channels["matrix"] = MatrixChannel(channels_cfg.matrix, self.bus)
                logger.info("Matrix channel enabled")
            except ImportError as e:
                logger.warning("Matrix channel not available: {}", e)

        # Web channel
        if channels_cfg.web.enabled:
            try:
                if self.session_manager is None or self.log_buffer is None:
                    raise RuntimeError("Web channel requires session_manager and log_buffer")

                from nanobot.channels.web import WebChannel
                from nanobot.web.services import ConfigService, SessionService

                session_service = SessionService(self.session_manager)
                config_service = ConfigService(self.config, self.config_path, self)
                channels["web"] = WebChannel(
                    channels_cfg.web,
                    self.bus,
                    session_service=session_service,
                    config_service=config_service,
                    channel_manager=self,
                    log_buffer=self.log_buffer,
                )
                logger.info("Web channel enabled")
            except ImportError as e:
                logger.warning("Web channel not available: {}", e)

        return channels

    def _validate_allow_from(self, channels: dict[str, BaseChannel]) -> None:
        for name, ch in channels.items():
            if getattr(ch.config, "allow_from", None) == []:
                raise SystemExit(
                    f'Error: "{name}" has empty allowFrom (denies all). '
                    f'Set ["*"] to allow everyone, or add specific user IDs.'
                )

    async def _start_channel(self, name: str, channel: BaseChannel) -> None:
        """Start a channel and log any exceptions."""
        try:
            await channel.start()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Failed to start channel {}: {}", name, e)

    def _launch_channel(self, name: str, channel: BaseChannel) -> None:
        task = asyncio.create_task(self._start_channel(name, channel))
        self._channel_tasks[name] = task

        def _on_done(done_task: asyncio.Task, channel_name: str = name) -> None:
            self._channel_tasks.pop(channel_name, None)
            if done_task.cancelled():
                return
            exc = done_task.exception()
            if exc:
                logger.error("Channel task {} exited with error: {}", channel_name, exc)
            else:
                logger.info("Channel task {} exited", channel_name)

        task.add_done_callback(_on_done)

    async def _stop_channels(self, channels: dict[str, BaseChannel]) -> None:
        # Stop channel workers first.
        for name, channel in channels.items():
            try:
                await channel.stop()
                logger.info("Stopped {} channel", name)
            except Exception as e:
                logger.error("Error stopping {}: {}", name, e)

        # Then cancel running channel tasks.
        for name, task in list(self._channel_tasks.items()):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error("Channel task {} cancellation error: {}", name, e)
            finally:
                self._channel_tasks.pop(name, None)

    async def start_all(self) -> None:
        """Start all channels and the outbound dispatcher."""
        if not self.channels:
            logger.warning("No channels enabled")
            return

        self._running = True
        self._dispatch_task = asyncio.create_task(self._dispatch_outbound())

        for name, channel in self.channels.items():
            logger.info("Starting {} channel...", name)
            self._launch_channel(name, channel)

        while self._running:
            await asyncio.sleep(0.5)

    async def stop_all(self) -> None:
        """Stop all channels and the dispatcher."""
        self._running = False
        logger.info("Stopping all channels...")

        if self._dispatch_task:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
            self._dispatch_task = None

        await self._stop_channels(self.channels)

    async def reload_channels(self, channels_cfg: ChannelsConfig) -> tuple[bool, list[str]]:
        """
        Reload channel instances from the provided channels config.

        Uses a best-effort transactional switch:
        - Build and validate new channel instances first.
        - Stop old channels.
        - Switch to new channels and launch their tasks.
        - On failure, rollback to old channels.
        """
        async with self._reload_lock:
            try:
                new_channels = self._build_channels(channels_cfg)
                self._validate_allow_from(new_channels)
            except Exception as exc:
                return False, [f"Build failed: {exc}"]

            old_cfg = self.config.channels
            old_channels = self.channels

            try:
                await self._stop_channels(old_channels)
                self.channels = new_channels
                self.config.channels = channels_cfg

                if self._running:
                    for name, channel in self.channels.items():
                        self._launch_channel(name, channel)
                    await asyncio.sleep(0)

                return True, []
            except Exception as exc:
                logger.error("Channel reload failed, attempting rollback: {}", exc)
                try:
                    await self._stop_channels(self.channels)
                except Exception:
                    logger.exception("Failed stopping partially started channels")

                self.channels = old_channels
                self.config.channels = old_cfg
                if self._running:
                    for name, channel in self.channels.items():
                        self._launch_channel(name, channel)
                return False, [str(exc)]

    async def _dispatch_outbound(self) -> None:
        """Dispatch outbound messages to the appropriate channel."""
        logger.info("Outbound dispatcher started")

        while True:
            try:
                msg = await asyncio.wait_for(self.bus.consume_outbound(), timeout=1.0)

                if msg.metadata.get("_progress"):
                    if msg.metadata.get("_tool_hint") and not self.config.channels.send_tool_hints:
                        continue
                    if not msg.metadata.get("_tool_hint") and not self.config.channels.send_progress:
                        continue

                channel = self.channels.get(msg.channel)
                if channel:
                    try:
                        await channel.send(msg)
                    except Exception as e:
                        logger.error("Error sending to {}: {}", msg.channel, e)
                else:
                    logger.warning("Unknown channel: {}", msg.channel)

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    def get_channel(self, name: str) -> BaseChannel | None:
        """Get a channel by name."""
        return self.channels.get(name)

    def get_status(self) -> dict[str, Any]:
        """Get status of all channels."""
        out = {}
        for name, channel in self.channels.items():
            item = {
                "enabled": True,
                "running": channel.is_running,
            }
            if name == "web" and hasattr(channel, "active_connections"):
                item["connections"] = getattr(channel, "active_connections")
            out[name] = item
        return out

    def get_runtime_metrics(self) -> dict[str, Any]:
        sessions = 0
        if self.session_manager is not None:
            try:
                sessions = len(self.session_manager.list_sessions())
            except Exception:
                sessions = 0
        return {
            "bus": {
                "inbound_size": self.bus.inbound_size,
                "outbound_size": self.bus.outbound_size,
            },
            "channels": self.get_status(),
            "active_sessions": sessions,
            "websocket_connections": (
                getattr(self.channels.get("web"), "active_connections", 0) if "web" in self.channels else 0
            ),
            "recent_error_count": self.log_buffer.recent_error_count() if self.log_buffer else 0,
        }

    def get_logs_snapshot(self, limit: int = 200) -> list[dict[str, Any]]:
        if not self.log_buffer:
            return []
        return self.log_buffer.snapshot(limit=limit)

    @property
    def enabled_channels(self) -> list[str]:
        """Get list of enabled channel names."""
        return list(self.channels.keys())

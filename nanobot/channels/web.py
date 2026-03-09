"""Web channel implementation with FastAPI + WebSocket."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING, Any

from loguru import logger

from nanobot.bus.events import OutboundMessage
from nanobot.bus.queue import MessageBus
from nanobot.channels.base import BaseChannel
from nanobot.config.schema import WebConfig
from nanobot.web.connection_manager import ConnectionManager
from nanobot.web.router import create_router
from nanobot.web.server import create_app

if TYPE_CHECKING:
    from nanobot.web.log_buffer import LogBuffer


class WebChannel(BaseChannel):
    """Web channel that serves API + WebSocket for browser clients."""

    name = "web"

    def __init__(
        self,
        config: WebConfig,
        bus: MessageBus,
        *,
        session_service,
        config_service,
        channel_manager,
        log_buffer: "LogBuffer",
    ):
        super().__init__(config, bus)
        self.config: WebConfig = config
        self._session_service = session_service
        self._config_service = config_service
        self._channel_manager = channel_manager
        self._log_buffer = log_buffer
        self._connection_manager = ConnectionManager()
        self._log_task: asyncio.Task | None = None
        self._status_task: asyncio.Task | None = None
        self._log_queue: asyncio.Queue | None = None
        self._server = None

    async def _on_chat_send(
        self, chat_id: str, content: str, media: list[str], metadata: dict[str, Any]
    ) -> None:
        sender_id = str(metadata.get("sender_id") or "web-user")
        await self._handle_message(
            sender_id=sender_id,
            chat_id=str(chat_id),
            content=content,
            media=media,
            metadata=metadata,
        )

    def _resolve_static_dir(self) -> Path:
        if self.config.static_path:
            return Path(self.config.static_path).expanduser().resolve()
        return (Path(__file__).resolve().parent.parent / "web" / "static").resolve()

    async def _pump_logs(self) -> None:
        if self._log_buffer is None:
            return
        self._log_queue = self._log_buffer.subscribe()
        try:
            while self._running:
                entry = await self._log_queue.get()
                await self._connection_manager.broadcast({"type": "log.entry", "data": entry})
        except asyncio.CancelledError:
            return
        finally:
            if self._log_queue is not None:
                self._log_buffer.unsubscribe(self._log_queue)
                self._log_queue = None

    async def _pump_status(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(2.0)
                payload = self._channel_manager.get_runtime_metrics()
                await self._connection_manager.broadcast({"type": "status.update", "data": payload})
        except asyncio.CancelledError:
            return

    async def start(self) -> None:
        """Start FastAPI/Uvicorn server."""
        try:
            import uvicorn
        except ImportError as exc:
            raise RuntimeError("Web channel requires uvicorn. Install with `pip install nanobot-ai[web]`.") from exc

        self._running = True
        static_dir = self._resolve_static_dir()
        if not static_dir.exists() or not (static_dir / "index.html").exists():
            logger.warning(
                "Web static assets missing at {}. Build frontend with `npm --prefix web run build`.",
                static_dir,
            )
        logger.info("Starting web channel on {}:{} (static: {})", self.config.host, self.config.port, static_dir)

        router = create_router(
            expected_token=self.config.auth_token,
            connection_manager=self._connection_manager,
            session_service=self._session_service,
            config_service=self._config_service,
            channel_manager=self._channel_manager,
            log_buffer=self._log_buffer,
            on_chat_send=self._on_chat_send,
        )
        app = create_app(
            router=router,
            cors_origins=self.config.cors_origins,
            static_dir=static_dir,
        )

        uvicorn_config = uvicorn.Config(
            app,
            host=self.config.host,
            port=self.config.port,
            log_level="info",
            access_log=self.config.access_log,
        )
        self._server = uvicorn.Server(uvicorn_config)
        self._log_task = asyncio.create_task(self._pump_logs())
        self._status_task = asyncio.create_task(self._pump_status())
        try:
            await self._server.serve()
        finally:
            self._running = False
            for task in (self._log_task, self._status_task):
                if task:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
            self._log_task = None
            self._status_task = None

    async def stop(self) -> None:
        """Stop the web server and internal worker tasks."""
        self._running = False
        if self._server is not None:
            self._server.should_exit = True

    async def send(self, msg: OutboundMessage) -> None:
        """Send outbound bus message to websocket clients."""
        await self._connection_manager.emit_chat(msg)

    @property
    def active_connections(self) -> int:
        return self._connection_manager.active_connections

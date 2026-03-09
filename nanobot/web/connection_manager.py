"""WebSocket connection manager for the web channel."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket
from loguru import logger

from nanobot.bus.events import OutboundMessage


@dataclass
class WSClient:
    websocket: WebSocket
    chat_id: str


class ConnectionManager:
    """Tracks active WebSocket clients and broadcasts events."""

    def __init__(self):
        self._clients: dict[int, WSClient] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, chat_id: str = "default") -> None:
        await websocket.accept(subprotocol="bearer")
        async with self._lock:
            self._clients[id(websocket)] = WSClient(websocket=websocket, chat_id=chat_id)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.pop(id(websocket), None)

    async def emit_chat(self, msg: OutboundMessage) -> None:
        payload = {
            "type": "chat.message",
            "data": {
                "chat_id": msg.chat_id,
                "content": msg.content,
                "media": msg.media or [],
                "metadata": msg.metadata or {},
            },
        }
        await self.broadcast(payload, chat_id=msg.chat_id)

    async def broadcast(self, event: dict[str, Any], chat_id: str | None = None) -> None:
        async with self._lock:
            clients = list(self._clients.values())

        stale: list[WebSocket] = []
        for client in clients:
            if chat_id and client.chat_id != chat_id:
                continue
            try:
                await client.websocket.send_json(event)
            except Exception:
                stale.append(client.websocket)

        for websocket in stale:
            logger.debug("Dropping stale websocket client")
            await self.disconnect(websocket)

    @property
    def active_connections(self) -> int:
        return len(self._clients)

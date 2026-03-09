"""In-memory log ring buffer with async subscriptions."""

from __future__ import annotations

import asyncio
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any


class LogBuffer:
    """Keeps recent logs in memory and streams new entries to subscribers."""

    def __init__(self, max_entries: int = 1000):
        self._entries: deque[dict[str, Any]] = deque(maxlen=max_entries)
        self._lock = threading.Lock()
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def sink(self, message: Any) -> None:
        """Loguru sink callback."""
        record = getattr(message, "record", None)
        if record is None:
            entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "INFO",
                "message": str(message).rstrip("\n"),
                "logger": "nanobot",
            }
        else:
            entry = {
                "timestamp": record["time"].isoformat(),
                "level": record["level"].name,
                "message": record["message"],
                "logger": record["name"],
            }

        with self._lock:
            self._entries.append(entry)
            subscribers = list(self._subscribers)

        loop = self._loop
        if loop is None:
            return

        for queue in subscribers:
            loop.call_soon_threadsafe(self._safe_publish, queue, entry)

    @staticmethod
    def _safe_publish(queue: asyncio.Queue[dict[str, Any]], entry: dict[str, Any]) -> None:
        try:
            queue.put_nowait(entry)
        except asyncio.QueueFull:
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                queue.put_nowait(entry)
            except asyncio.QueueFull:
                return

    def snapshot(self, limit: int = 200) -> list[dict[str, Any]]:
        limit = max(1, min(limit, 5000))
        with self._lock:
            return list(self._entries)[-limit:]

    def subscribe(self, max_queue: int = 256) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=max_queue)
        with self._lock:
            self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        with self._lock:
            self._subscribers.discard(queue)

    @property
    def subscribers(self) -> int:
        with self._lock:
            return len(self._subscribers)

    def recent_error_count(self, limit: int = 200) -> int:
        levels = {"ERROR", "CRITICAL"}
        with self._lock:
            tail = list(self._entries)[-max(1, limit):]
        return sum(1 for item in tail if item.get("level") in levels)

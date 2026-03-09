"""HTTP and WebSocket routes for the web channel."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from nanobot.web.connection_manager import ConnectionManager


def _extract_header_token(value: str | None) -> str:
    if not value:
        return ""
    prefix = "bearer "
    if value.lower().startswith(prefix):
        return value[len(prefix):].strip()
    return ""


def _extract_ws_protocol_token(value: str | None) -> str:
    if not value:
        return ""
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if len(parts) < 2:
        return ""
    if parts[0].lower() != "bearer":
        return ""
    return parts[1]


def _check_http_auth(request: Request, expected_token: str) -> None:
    token = _extract_header_token(request.headers.get("authorization"))
    if not expected_token or token != expected_token:
        raise HTTPException(status_code=401, detail="Unauthorized")


def create_router(
    *,
    expected_token: str,
    connection_manager: ConnectionManager,
    session_service,
    config_service,
    channel_manager,
    log_buffer,
    on_chat_send: Callable[[str, str, list[str], dict[str, Any]], Awaitable[None]],
) -> APIRouter:
    router = APIRouter()

    @router.get("/api/health")
    async def health(request: Request) -> dict[str, str]:
        _check_http_auth(request, expected_token)
        return {"status": "ok"}

    @router.get("/api/status")
    async def status(request: Request) -> dict[str, Any]:
        _check_http_auth(request, expected_token)
        return channel_manager.get_runtime_metrics()

    @router.get("/api/sessions")
    async def list_sessions(request: Request) -> dict[str, Any]:
        _check_http_auth(request, expected_token)
        return {"items": session_service.list_sessions()}

    @router.get("/api/sessions/{key:path}")
    async def get_session(key: str, request: Request) -> dict[str, Any]:
        _check_http_auth(request, expected_token)
        item = session_service.get_session(key)
        if item is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return item

    @router.delete("/api/sessions/{key:path}")
    async def delete_session(key: str, request: Request) -> dict[str, Any]:
        _check_http_auth(request, expected_token)
        if not session_service.delete_session(key):
            raise HTTPException(status_code=404, detail="Session not found")
        return {"deleted": True, "key": key}

    @router.get("/api/config")
    async def get_config(request: Request) -> dict[str, Any]:
        _check_http_auth(request, expected_token)
        return {"channels": config_service.get_public_channels()}

    @router.post("/api/config")
    async def update_config(payload: dict[str, Any], request: Request) -> dict[str, Any]:
        _check_http_auth(request, expected_token)
        return await config_service.update_channels(payload)

    @router.get("/api/logs")
    async def get_logs(request: Request, limit: int = 200) -> dict[str, Any]:
        _check_http_auth(request, expected_token)
        return {"items": log_buffer.snapshot(limit=limit)}

    @router.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        token = _extract_ws_protocol_token(websocket.headers.get("sec-websocket-protocol"))
        if not expected_token or token != expected_token:
            await websocket.close(code=4401, reason="Unauthorized")
            return

        chat_id = websocket.query_params.get("chat_id") or "default"
        await connection_manager.connect(websocket, chat_id=chat_id)
        await connection_manager.broadcast(
            {"type": "status.update", "data": channel_manager.get_runtime_metrics()},
            chat_id=chat_id,
        )

        try:
            while True:
                payload = await websocket.receive_json()
                kind = payload.get("type")
                data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}

                if kind == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                if kind != "chat.send":
                    await websocket.send_json(
                        {"type": "error", "data": {"message": "Unsupported message type"}}
                    )
                    continue

                content = data.get("content")
                if not isinstance(content, str) or not content.strip():
                    await websocket.send_json(
                        {"type": "error", "data": {"message": "content must be a non-empty string"}}
                    )
                    continue

                media_raw = data.get("media") if isinstance(data.get("media"), list) else []
                media = [str(item) for item in media_raw]
                metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
                target_chat_id = str(data.get("chat_id") or chat_id)
                await on_chat_send(target_chat_id, content, media, metadata)
        except WebSocketDisconnect:
            await connection_manager.disconnect(websocket)
        except Exception:
            await connection_manager.disconnect(websocket)
            raise

    return router

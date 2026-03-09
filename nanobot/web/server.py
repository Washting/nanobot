"""FastAPI app factory for web channel."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse


def create_app(*, router, cors_origins: list[str], static_dir: Path) -> FastAPI:
    app = FastAPI(title="nanobot web channel")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    static_dir = static_dir.resolve()
    index_file = static_dir / "index.html"

    if static_dir.exists() and index_file.exists():

        @app.get("/", include_in_schema=False)
        async def root() -> FileResponse:
            return FileResponse(index_file)

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str) -> FileResponse:
            if path.startswith("api/") or path == "ws":
                raise HTTPException(status_code=404, detail="Not found")
            candidate = (static_dir / path).resolve()
            if candidate.exists() and candidate.is_file() and str(candidate).startswith(str(static_dir)):
                return FileResponse(candidate)
            return FileResponse(index_file)

    return app

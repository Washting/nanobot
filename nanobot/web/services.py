"""Service layer for web APIs."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

from nanobot.config.loader import save_config
from nanobot.config.schema import ChannelsConfig, Config

MASK_VALUE = "********"
RESTART_REQUIRED_WEB_FIELDS = {"host", "port", "staticPath", "corsOrigins"}


class SessionService:
    """Session read/write operations for web APIs."""

    def __init__(self, session_manager):
        self.session_manager = session_manager

    def list_sessions(self) -> list[dict[str, Any]]:
        return self.session_manager.list_sessions()

    def get_session(self, key: str) -> dict[str, Any] | None:
        session = self.session_manager.get(key)
        if session is None:
            return None
        return {
            "key": session.key,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "metadata": session.metadata,
            "last_consolidated": session.last_consolidated,
            "messages": session.messages,
        }

    def delete_session(self, key: str) -> bool:
        return self.session_manager.delete(key)


class ConfigService:
    """Configuration API with secret masking and channel hot-reload support."""

    def __init__(self, config: Config, config_path: Path, channel_manager):
        self.config = config
        self.config_path = config_path
        self.channel_manager = channel_manager

    @staticmethod
    def _is_sensitive(key: str) -> bool:
        lower = key.lower()
        return any(
            token in lower
            for token in (
                "apikey",
                "api_key",
                "token",
                "secret",
                "password",
            )
        )

    def _masked(self, value: Any, key: str | None = None) -> Any:
        if isinstance(value, dict):
            return {k: self._masked(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [self._masked(v) for v in value]
        if isinstance(value, str) and key and self._is_sensitive(key):
            return MASK_VALUE if value else ""
        return value

    @classmethod
    def _merge_channel_payload(cls, old: Any, new: Any, key: str | None = None) -> Any:
        if isinstance(old, dict) and isinstance(new, dict):
            merged = dict(old)
            for k, v in new.items():
                merged[k] = cls._merge_channel_payload(old.get(k), v, k)
            return merged

        if isinstance(new, str) and key and cls._is_sensitive(key):
            if new == MASK_VALUE or new == "":
                return old if old is not None else ""
            return new

        return new

    @staticmethod
    def _collect_changed_paths(old: Any, new: Any, prefix: str = "channels") -> list[str]:
        if isinstance(old, dict) and isinstance(new, dict):
            paths: list[str] = []
            all_keys = set(old) | set(new)
            for k in sorted(all_keys):
                paths.extend(
                    ConfigService._collect_changed_paths(old.get(k), new.get(k), f"{prefix}.{k}")
                )
            return paths

        if old != new:
            return [prefix]
        return []

    def get_public_channels(self) -> dict[str, Any]:
        channels = self.config.channels.model_dump(by_alias=True)
        return self._masked(channels)

    async def update_channels(self, payload: dict[str, Any]) -> dict[str, Any]:
        if set(payload.keys()) != {"channels"}:
            return {
                "applied": False,
                "restart_required_fields": [],
                "reloaded_channels": [],
                "errors": ["Only 'channels' subtree updates are supported."],
            }

        raw_channels = payload.get("channels")
        if not isinstance(raw_channels, dict):
            return {
                "applied": False,
                "restart_required_fields": [],
                "reloaded_channels": [],
                "errors": ["channels must be an object."],
            }

        old_channels = self.config.channels.model_dump(by_alias=True)
        merged_channels = self._merge_channel_payload(old_channels, raw_channels)

        try:
            validated_channels = ChannelsConfig.model_validate(merged_channels)
        except Exception as exc:
            return {
                "applied": False,
                "restart_required_fields": [],
                "reloaded_channels": [],
                "errors": [f"Invalid channels config: {exc}"],
            }

        changed = self._collect_changed_paths(old_channels, validated_channels.model_dump(by_alias=True))
        restart_required_fields: list[str] = []
        for path in changed:
            if path.startswith("channels.web."):
                field = path.split(".", 2)[-1]
                if field in RESTART_REQUIRED_WEB_FIELDS:
                    restart_required_fields.append(path)

        old_config = deepcopy(self.config)
        self.config.channels = validated_channels
        save_config(self.config, self.config_path)

        runtime_channels = validated_channels.model_dump(by_alias=True)
        if restart_required_fields:
            old_web = old_channels.get("web", {})
            runtime_web = runtime_channels.get("web", {})
            for field in RESTART_REQUIRED_WEB_FIELDS:
                if field in runtime_web:
                    runtime_web[field] = old_web.get(field, runtime_web[field])

        try:
            runtime_cfg = ChannelsConfig.model_validate(runtime_channels)
            ok, errors = await self.channel_manager.reload_channels(runtime_cfg)
        except Exception as exc:
            ok, errors = False, [str(exc)]

        if not ok:
            self.config.channels = old_config.channels
            save_config(self.config, self.config_path)
            rollback_ok, rollback_errors = await self.channel_manager.reload_channels(old_config.channels)
            if not rollback_ok:
                errors = errors + [f"Rollback failed: {'; '.join(rollback_errors)}"]
            return {
                "applied": False,
                "restart_required_fields": restart_required_fields,
                "reloaded_channels": [],
                "errors": errors,
            }

        return {
            "applied": True,
            "restart_required_fields": restart_required_fields,
            "reloaded_channels": self.channel_manager.enabled_channels,
            "errors": [],
        }

from __future__ import annotations

import os
from dataclasses import dataclass


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return default if value is None else float(value)


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return default if value is None else int(value)


@dataclass(frozen=True)
class AppSettings:
    app_name: str = "eli-hmi-epics-gateway"
    host: str = "0.0.0.0"
    port: int = 8080
    log_level: str = "INFO"
    log_json: bool = False
    default_timeout: float = 2.0
    max_timeout: float = 10.0
    max_pvs_per_subscription: int = 64
    max_subscriptions_per_connection: int = 32
    websocket_max_message_size: int = 65536
    enable_docs: bool = True

    @classmethod
    def from_env(cls) -> "AppSettings":
        return cls(
            app_name=os.getenv("APP_NAME", cls.app_name),
            host=os.getenv("HOST", cls.host),
            port=_get_int("PORT", cls.port),
            log_level=os.getenv("LOG_LEVEL", cls.log_level).upper(),
            log_json=_get_bool("LOG_JSON", cls.log_json),
            default_timeout=_get_float("DEFAULT_TIMEOUT", cls.default_timeout),
            max_timeout=_get_float("MAX_TIMEOUT", cls.max_timeout),
            max_pvs_per_subscription=_get_int(
                "MAX_PVS_PER_SUBSCRIPTION",
                cls.max_pvs_per_subscription,
            ),
            max_subscriptions_per_connection=_get_int(
                "MAX_SUBSCRIPTIONS_PER_CONNECTION",
                cls.max_subscriptions_per_connection,
            ),
            websocket_max_message_size=_get_int(
                "WEBSOCKET_MAX_MESSAGE_SIZE",
                cls.websocket_max_message_size,
            ),
            enable_docs=_get_bool("ENABLE_DOCS", cls.enable_docs),
        )

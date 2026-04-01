from __future__ import annotations

import math
from typing import Any

from api_contract import DetailLevel


COMMON_METADATA_FIELDS = (
    "datatype",
    "element_count",
)

TIME_METADATA_FIELDS = (
    "status",
    "severity",
    "timestamp",
    "raw_stamp",
)

CONTROL_METADATA_FIELDS = (
    "units",
    "precision",
    "enums",
    "upper_disp_limit",
    "lower_disp_limit",
    "upper_alarm_limit",
    "lower_alarm_limit",
    "upper_warning_limit",
    "lower_warning_limit",
    "upper_ctrl_limit",
    "lower_ctrl_limit",
)


def to_json_safe_value(value: Any) -> Any:
    if hasattr(value, "tolist"):
        value = value.tolist()
    elif hasattr(value, "item") and not isinstance(value, (str, bytes, bytearray)):
        try:
            value = value.item()
        except ValueError:
            pass

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if isinstance(value, list):
        return [to_json_safe_value(item) for item in value]

    if isinstance(value, tuple):
        return [to_json_safe_value(item) for item in value]

    if isinstance(value, dict):
        return {key: to_json_safe_value(item) for key, item in value.items()}

    return value


def _collect_metadata_fields(value: Any, detail: DetailLevel) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for field_name in COMMON_METADATA_FIELDS:
        if hasattr(value, field_name):
            metadata[field_name] = to_json_safe_value(getattr(value, field_name))

    if detail in {DetailLevel.TIME, DetailLevel.CONTROL}:
        for field_name in TIME_METADATA_FIELDS:
            if hasattr(value, field_name):
                metadata[field_name] = to_json_safe_value(getattr(value, field_name))

    if detail == DetailLevel.CONTROL:
        for field_name in CONTROL_METADATA_FIELDS:
            if hasattr(value, field_name):
                metadata[field_name] = to_json_safe_value(getattr(value, field_name))

    return metadata


def build_pv_payload(value: Any, *, detail: DetailLevel) -> dict[str, Any]:
    return {
        "value": to_json_safe_value(value),
        "metadata": _collect_metadata_fields(value, detail),
    }


def error_payload(value: Any) -> dict[str, Any]:
    return {
        "error": {
            "code": getattr(value, "errorcode", None),
            "message": str(value),
        },
    }


def generic_error_payload(code: str, message: str) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
        },
    }


def build_pv_response(
    *,
    operation: str,
    event: str,
    pv_name: str,
    detail: DetailLevel,
    ok: bool,
    payload: dict[str, Any],
    subscription_id: str | None = None,
) -> dict[str, Any]:
    response = {
        "type": event,
        "operation": operation,
        "subscription_id": subscription_id,
        "pv": pv_name,
        "detail": detail.value,
        "ok": ok,
    }
    response.update(payload)
    return response

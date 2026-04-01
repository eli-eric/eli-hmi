import math
from typing import Any


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

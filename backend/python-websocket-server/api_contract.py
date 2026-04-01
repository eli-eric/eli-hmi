from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DetailLevel(str, Enum):
    VALUE = "value"
    TIME = "time"
    CONTROL = "control"


class DatatypeAlias(str, Enum):
    NATIVE = "native"
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    ENUM_STRING = "enum_string"
    CHAR_STRING = "char_string"
    CHAR_BYTES = "char_bytes"
    CHAR_UNICODE = "char_unicode"
    CLASS_NAME = "class_name"
    STSACK_STRING = "stsack_string"


def validate_pv_name(pv_name: str) -> str:
    stripped = pv_name.strip()
    if not stripped:
        raise ValueError("PV name must not be empty")
    if len(stripped) > 256:
        raise ValueError("PV name must not exceed 256 characters")
    if any(character.isspace() for character in stripped):
        raise ValueError("PV name must not contain whitespace")
    return stripped


class ReadRequestOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: DetailLevel = DetailLevel.VALUE
    datatype: DatatypeAlias | None = None
    count: int = Field(default=0, ge=-1, le=100000)
    timeout: float | None = Field(default=None, gt=0.0, le=120.0)


class SubscribeMessage(ReadRequestOptions):
    type: Literal["subscribe"]
    subscription_id: str = Field(min_length=1, max_length=64)
    pvs: list[str] = Field(min_length=1, max_length=256)
    all_updates: bool = False
    notify_disconnect: bool = True

    @field_validator("pvs")
    @classmethod
    def validate_pvs(cls, pvs: list[str]) -> list[str]:
        return [validate_pv_name(pv) for pv in pvs]


class UnsubscribeMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["unsubscribe"]
    subscription_id: str = Field(min_length=1, max_length=64)


class PingMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["ping"]
    nonce: str | None = Field(default=None, max_length=128)


InboundMessage = Annotated[
    Union[SubscribeMessage, UnsubscribeMessage, PingMessage],
    Field(discriminator="type"),
]

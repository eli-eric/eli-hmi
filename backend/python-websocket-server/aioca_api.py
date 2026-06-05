from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import aioca

from api_contract import DatatypeAlias, DetailLevel, ReadRequestOptions
from pv_serialization import build_pv_payload, build_pv_response, error_payload


DETAIL_TO_FORMAT = {
    DetailLevel.VALUE: aioca.FORMAT_RAW,
    DetailLevel.TIME: aioca.FORMAT_TIME,
    DetailLevel.CONTROL: aioca.FORMAT_CTRL,
}


DATATYPE_TO_AIOCA: dict[DatatypeAlias, Any] = {
    DatatypeAlias.NATIVE: None,
    DatatypeAlias.STRING: str,
    DatatypeAlias.INTEGER: int,
    DatatypeAlias.FLOAT: float,
    DatatypeAlias.ENUM_STRING: aioca.DBR_ENUM_STR,
    DatatypeAlias.CHAR_STRING: aioca.DBR_CHAR_STR,
    DatatypeAlias.CHAR_BYTES: aioca.DBR_CHAR_BYTES,
    DatatypeAlias.CHAR_UNICODE: aioca.DBR_CHAR_UNICODE,
    DatatypeAlias.CLASS_NAME: aioca.DBR_CLASS_NAME,
    DatatypeAlias.STSACK_STRING: aioca.DBR_STSACK_STRING,
}


@dataclass(frozen=True)
class ResolvedReadOptions:
    detail: DetailLevel
    datatype_alias: DatatypeAlias | None
    datatype: Any
    format_code: int
    count: int
    timeout: float | None
    all_updates: bool = False
    notify_disconnect: bool = True


def resolve_read_options(
    request: ReadRequestOptions,
    *,
    default_timeout: float,
    max_timeout: float,
    all_updates: bool = False,
    notify_disconnect: bool = True,
) -> ResolvedReadOptions:
    timeout = request.timeout if request.timeout is not None else default_timeout
    timeout = min(timeout, max_timeout)
    datatype_alias = request.datatype
    datatype = None if datatype_alias is None else DATATYPE_TO_AIOCA[datatype_alias]
    return ResolvedReadOptions(
        detail=request.detail,
        datatype_alias=datatype_alias,
        datatype=datatype,
        format_code=DETAIL_TO_FORMAT[request.detail],
        count=request.count,
        timeout=timeout,
        all_updates=all_updates,
        notify_disconnect=notify_disconnect,
    )


async def get_once(pv_name: str, options: ResolvedReadOptions) -> dict[str, Any]:
    value = await aioca.caget(
        pv_name,
        datatype=options.datatype,
        format=options.format_code,
        count=options.count,
        timeout=options.timeout,
        throw=False,
    )
    if value.ok:
        payload = build_pv_payload(value, detail=options.detail)
        return build_pv_response(
            operation="get",
            event="result",
            pv_name=pv_name,
            detail=options.detail,
            ok=True,
            payload=payload,
        )

    return build_pv_response(
        operation="get",
        event="result",
        pv_name=pv_name,
        detail=options.detail,
        ok=False,
        payload=error_payload(value),
    )


async def put_once(
    pv_name: str,
    value: Any,
    *,
    timeout: float,
) -> None:
    await aioca.caput(
        pv_name,
        value,
        timeout=timeout,
        throw=True,
    )

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket
from fastapi.responses import JSONResponse

from aioca_api import get_once, resolve_read_options
from api_contract import DatatypeAlias, DetailLevel, ReadRequestOptions, validate_pv_name
from app_settings import AppSettings
from logging_utils import configure_logging
from pv_serialization import build_pv_response, generic_error_payload
from websocket_pv_manager import WebSocketPVsManager


settings = AppSettings.from_env()
configure_logging(settings.log_level, settings.log_json)
logger = logging.getLogger(__name__)
ws_manager = WebSocketPVsManager(logger=logger, settings=settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ws_manager.startup()
    logger.info("Application started")
    try:
        yield
    finally:
        await ws_manager.shutdown()
        logger.info("Application stopped")


app = FastAPI(
    title="ELI HMI EPICS Gateway",
    version="0.1.0",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    lifespan=lifespan,
)


@app.get("/health/live")
async def health_live() -> dict[str, str]:
    return {"status": "live"}


@app.get("/health/ready")
async def health_ready() -> dict[str, str]:
    return {"status": "ready" if ws_manager.ready else "starting"}


@app.websocket("/ws/pvs")
async def establish_pvs_websocket(websocket: WebSocket) -> None:
    await ws_manager.websocket_handler(websocket)


@app.get("/pv/{pv_name}")
async def get_pv(
    pv_name: str,
    detail: DetailLevel = Query(default=DetailLevel.VALUE),
    datatype: DatatypeAlias | None = Query(default=None),
    count: int = Query(default=0, ge=-1, le=100000),
    timeout: float | None = Query(default=None, gt=0.0, le=120.0),
) -> dict[str, object]:
    validated_pv_name = validate_pv_name(pv_name)
    options = resolve_read_options(
        ReadRequestOptions(
            detail=detail,
            datatype=datatype,
            count=count,
            timeout=timeout,
        ),
        default_timeout=settings.default_timeout,
        max_timeout=settings.max_timeout,
    )

    try:
        response = await get_once(validated_pv_name, options)
    except Exception:
        logger.exception("Failed to read PV %s", validated_pv_name)
        return JSONResponse(
            status_code=500,
            content=build_pv_response(
                operation="get",
                event="result",
                pv_name=validated_pv_name,
                detail=options.detail,
                ok=False,
                payload=generic_error_payload("internal_error", "Internal server error"),
            ),
        )

    if not response["ok"]:
        return JSONResponse(status_code=502, content=response)

    return response

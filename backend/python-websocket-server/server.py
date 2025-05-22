from typing import Union

from fastapi import FastAPI, WebSocket
from fastapi.responses import PlainTextResponse
import logging
import aioca
from websocket_pv_manager import WebSocketPVsManager

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
wsManager = WebSocketPVsManager(logger=logger)


@app.websocket("/ws/pvs")
async def establish_pvs_websocket(websocket: WebSocket):
    """
    Establishes a WebSocket connection for PVs (Process Variables).

    This function handles the WebSocket connection by passing the WebSocket
    object to the wsManager's handle_websocket_connection method.

    Args:
        websocket (WebSocket): The WebSocket connection to be established.
    """

    # do super dummy authentication here
    # has to be done before the websocket is added to the manager
    # TODO: implement proper authentication
    # control query parameter dummyKey

    # dummy_key = websocket.query_params.get("dummyToken")
    # logger.info("Received dummy key: %s", dummy_key)
    # if dummy_key != "i_love_laser":
    #     await websocket.close(code=1008)
    #     return PlainTextResponse(content="Unauthorized", status_code=401)

    await wsManager.websocket_handler(websocket)


@app.get("/pv/{pv_name}")
async def get_pv(pv_name: str):
    """
    Fetch the value of a Process Variable (PV) asynchronously.
    Args:
        pv_name (str): The name of the PV to fetch.
    Returns:
        dict: A dictionary containing the PV name, value, and optionally units, status, and severity if available.
        PlainTextResponse: A response with an error message and status code 500 if fetching the PV fails.
    Raises:
        Exception: If an unexpected error occurs during the fetching of the PV.
    """
    try:
        # Get the value of the PV
        value = await aioca.caget(pv_name, format=2)

        if value.ok:

            result = {"name": pv_name, "value": value}

            if hasattr(value, "units"):
                result["units"] = value.units

            if value.status:
                result["status"] = value.status

            if value.severity:
                result["severity"] = value.severity

            logger.info("Successfully fetched PV %s: %s", pv_name, value)

            return result

        logger.error("Failed to fetch PV %s: %s", pv_name, value.error)
        return PlainTextResponse(content="Failed to fetch PV", status_code=500)

    except Exception as e:
        logger.exception("Failed to fetch PV %s: %s", pv_name, str(e))
        return PlainTextResponse(content="Failed to fetch PV", status_code=500)

from typing import Union

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
import logging
import aioca

app = FastAPI()
logger = logging.getLogger(__name__)


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

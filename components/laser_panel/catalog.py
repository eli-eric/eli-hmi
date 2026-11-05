"""The waveform catalog a Modbox serves over HTTP.

Fetched by the server rather than the browser, which is the one thing this app
can do that the React panel cannot: no CORS to arrange on each device, no
credentials in the browser, and the list is in the first paint instead of
arriving after it.

A Modbox that will not answer is not an error the operator can act on — the
rest of the screen is still live and useful — so a failure logs and yields an
empty list rather than propagating.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

#: Long enough for a device on the control network, short enough that opening
#: a cog does not feel stuck.
TIMEOUT_SECONDS = 3.0


async def fetch_catalog(url: str) -> list[str]:
    """The waveform names the Modbox at `url` offers.

    Expects a JSON array of names. Anything else yields an empty list: a device
    answering oddly should not take the Modbox section down with it.
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # noqa: BLE001 - any failure degrades the same way
        logger.warning("waveform catalog unavailable at %s: %s", url, exc)
        return []
    if not isinstance(payload, list):
        logger.warning("waveform catalog at %s is not a list of names", url)
        return []
    return [name for name in payload if isinstance(name, str)]

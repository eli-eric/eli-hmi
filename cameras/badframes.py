"""Bad frames, logged at the rate a person reads, not the rate a camera sends.

A camera that sends unusable frames (the wrong size, not a PNG, an encode that
fails) sends them ten times a second. A log line each would bury everything
else in the log and in /monitor's, and grow the log files by the megabyte.
So, per camera:

* the first bad frame of a run is logged, with its reason;
* while the run lasts, one summary per `summary_every` seconds says how many
  more there were and the latest reason;
* the first good frame after a run is logged once, with the run's length.

A disconnect is not a bad frame: the tile says CAMERA DSC and the run, if any,
carries on when the camera returns.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable

logger = logging.getLogger(__name__)

#: How often a camera that stays bad is summarised.
SUMMARY_SECONDS = 60.0


@dataclass
class _Run:
    started: float
    summarised: float
    reason: str
    total: int = 1
    since_summary: int = 0


class BadFrameLog:
    def __init__(
        self,
        *,
        summary_every: float = SUMMARY_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._every = summary_every
        self._clock = clock
        self._runs: dict[str, _Run] = {}

    def bad(self, pv: str, reason: str, *, level: int = logging.WARNING, exc_info: bool = False) -> None:
        """A frame from `pv` that could not be shown. `exc_info` attaches the
        current exception's traceback to the first line of a run only."""
        now = self._clock()
        run = self._runs.get(pv)
        if run is None:
            self._runs[pv] = _Run(started=now, summarised=now, reason=reason)
            logger.log(
                level,
                "camera %s: bad frame: %s (more from this camera are summarised every %.0f s)",
                pv, reason, self._every, exc_info=exc_info,
            )
            return
        run.total += 1
        run.since_summary += 1
        run.reason = reason
        if now - run.summarised >= self._every:
            logger.log(
                level,
                "camera %s: %d more bad frames in the last %.0f s, latest: %s",
                pv, run.since_summary, now - run.summarised, reason,
            )
            run.summarised, run.since_summary = now, 0

    def good(self, pv: str) -> None:
        """A frame from `pv` was shown. Ends its run, if it had one."""
        run = self._runs.pop(pv, None)
        if run is not None:
            logger.info(
                "camera %s: good frames again after %d bad over %.0f s",
                pv, run.total, self._clock() - run.started,
            )

    def forget(self, pv: str) -> None:
        """Nobody watches `pv` any more: its run ends without a word."""
        self._runs.pop(pv, None)

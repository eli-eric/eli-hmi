"""Who is watching: one record per open SSE stream.

Sessions are stateless signed cookies (`core.auth`), so there is no session
table to list. An open stream is the honest answer to "who is connected" anyway:
a browser that is signed in but has no screen open is not watching anything,
and one with three tabs open is three streams, each holding its own monitors.

Kept on `app.hmi.clients` and read by `/monitor`. Everything here runs on the
event loop, so it needs no lock.
"""

from __future__ import annotations

import itertools
import re
import time
from dataclasses import dataclass, field
from typing import Literal

ClientKind = Literal["screen", "monitor"]


@dataclass(eq=False)
class Client:
    id: int
    kind: ClientKind
    slug: str
    user: str
    ip: str
    user_agent: str
    opened_at: float = field(default_factory=time.time)
    events: int = 0
    last_event_at: float | None = None

    def sent(self) -> None:
        """One SSE event went out on this stream."""
        self.events += 1
        self.last_event_at = time.time()

    @property
    def browser(self) -> str:
        return browser_label(self.user_agent)


class ClientRegistry:
    def __init__(self) -> None:
        self._open: dict[int, Client] = {}
        self._ids = itertools.count(1)

    def open(
        self, *, kind: ClientKind, slug: str, user: str, ip: str, user_agent: str
    ) -> Client:
        client = Client(
            id=next(self._ids), kind=kind, slug=slug, user=user, ip=ip, user_agent=user_agent
        )
        self._open[client.id] = client
        return client

    def close(self, client: Client) -> None:
        self._open.pop(client.id, None)

    def active(self) -> list[Client]:
        """Oldest first: the order they connected in."""
        return list(self._open.values())


# Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
_BROWSERS = (
    ("Edge", re.compile(r"\bEdg(?:e|A|iOS)?/(\d+)")),
    ("Opera", re.compile(r"\bOPR/(\d+)")),
    ("Firefox", re.compile(r"\bFirefox/(\d+)")),
    ("Chrome", re.compile(r"\b(?:Headless)?(?:Chrome|CriOS)/(\d+)")),
    ("Safari", re.compile(r"\bVersion/(\d+).*\bSafari/")),
)
_SYSTEMS = (
    ("Windows", "Windows"),
    ("Android", "Android"),
    ("iPhone", "iOS"),
    ("iPad", "iOS"),
    ("Mac OS X", "macOS"),
    ("Linux", "Linux"),
)


def browser_label(user_agent: str) -> str:
    """"Firefox 128 · Linux" from a user agent string — a name and a major
    version, which is what a table cell has room for. Anything unrecognised
    (a script, a probe) is shown as its first product token."""
    agent = (user_agent or "").strip()
    if not agent:
        return "-"
    for name, pattern in _BROWSERS:
        match = pattern.search(agent)
        if match:
            system = next((label for token, label in _SYSTEMS if token in agent), None)
            label = f"{name} {match.group(1)}"
            return f"{label} · {system}" if system else label
    return agent.split()[0].replace("/", " ", 1)[:40]

"""The registry of open streams: who is watching which screen, from where.

Sessions are stateless cookies, so the open SSE streams are the only honest
answer to "who is connected" — a signed-in browser that has no screen open is
not watching anything.
"""

from __future__ import annotations

import pytest

from core.clients import ClientRegistry

CHROME_LINUX = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
FIREFOX_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
)
EDGE_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70"
)
SAFARI_MAC = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Safari/605.1.15"
)


def open_one(registry: ClientRegistry, **over):
    fields = dict(kind="screen", slug="chillers", user="test", ip="10.0.0.5", user_agent="")
    fields.update(over)
    return registry.open(**fields)


def test_an_open_stream_is_listed_until_it_closes():
    registry = ClientRegistry()
    first = open_one(registry, slug="chillers")
    second = open_one(registry, slug="vacuum", user="alice")
    assert [client.slug for client in registry.active()] == ["chillers", "vacuum"]

    registry.close(first)
    assert registry.active() == [second]


def test_closing_twice_is_harmless():
    """A stream's `finally` and a shutdown can both get there."""
    registry = ClientRegistry()
    client = open_one(registry)
    registry.close(client)
    registry.close(client)
    assert registry.active() == []


def test_every_stream_gets_its_own_id():
    registry = ClientRegistry()
    assert open_one(registry).id != open_one(registry).id


def test_events_sent_are_counted_with_the_time_of_the_last():
    registry = ClientRegistry()
    client = open_one(registry)
    assert client.events == 0 and client.last_event_at is None
    client.sent()
    client.sent()
    assert client.events == 2
    assert client.last_event_at is not None and client.last_event_at >= client.opened_at


@pytest.mark.parametrize(
    "agent, label",
    [
        (CHROME_LINUX, "Chrome 131 · Linux"),
        (FIREFOX_WINDOWS, "Firefox 128 · Windows"),
        (EDGE_WINDOWS, "Edge 131 · Windows"),
        (SAFARI_MAC, "Safari 17 · macOS"),
        # A kiosk station or a screenshot job runs Chrome headless.
        (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
            "Chrome 131 · macOS",
        ),
        ("python-httpx/0.27.0", "python-httpx 0.27.0"),
        ("", "-"),
    ],
)
def test_the_browser_is_named_briefly(agent, label):
    """The full user agent is a paragraph; a table cell wants a name and a
    major version — enough to spot the one station still on an old browser."""
    client = open_one(ClientRegistry(), user_agent=agent)
    assert client.browser == label

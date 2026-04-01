from __future__ import annotations

import logging
import unittest

from fastapi.testclient import TestClient

from aioca_api import resolve_read_options
from api_contract import DetailLevel, SubscribeMessage
from app_settings import AppSettings
from server import app
import server
from websocket_pv_manager import (
    ClientSubscription,
    ConnectionState,
    MonitorKey,
    MonitorRecord,
    SubscriberRef,
    WebSocketPVsManager,
)


class DummyWebSocket:
    async def send_json(self, payload):
        return None

    async def close(self, code=1000):
        return None


class DummySubscription:
    def close(self) -> None:
        return None


class DummyPVValue:
    ok = True
    datatype = "float"
    element_count = 1
    status = 0
    severity = 0
    timestamp = 1711962000.0
    raw_stamp = (1711962000, 0)

    def __init__(self, value):
        self._value = value

    def item(self):
        return self._value


def make_manager() -> WebSocketPVsManager:
    return WebSocketPVsManager(
        logger=logging.getLogger("test-stats"),
        settings=AppSettings(),
    )


def make_subscription(subscription_id: str, pvs: list[str]) -> ClientSubscription:
    request = SubscribeMessage(
        type="subscribe",
        subscription_id=subscription_id,
        pvs=pvs,
        detail=DetailLevel.TIME,
        timeout=2.0,
        all_updates=False,
        notify_disconnect=True,
    )
    return ClientSubscription(
        request=request,
        options=resolve_read_options(
            request,
            default_timeout=2.0,
            max_timeout=10.0,
            all_updates=request.all_updates,
            notify_disconnect=request.notify_disconnect,
        ),
        monitor_keys=[],
    )


class StatsEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_manager = server.ws_manager

    def tearDown(self) -> None:
        server.ws_manager = self.original_manager

    def test_stats_returns_empty_snapshot(self) -> None:
        server.ws_manager = make_manager()

        with TestClient(app) as client:
            response = client.get("/stats")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "ready": True,
                "active_connections": 0,
                "active_monitors": 0,
                "total_client_subscriptions": 0,
                "total_subscribers": 0,
                "connections": [],
                "monitors": [],
            },
        )

    def test_stats_ui_returns_html_dashboard(self) -> None:
        server.ws_manager = make_manager()

        with TestClient(app) as client:
            response = client.get("/stats/ui")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers["content-type"])
        self.assertIn("EPICS gateway runtime stats", response.text)
        self.assertIn("fetch('/stats'", response.text)

    def test_stats_reports_shared_monitors_and_cached_values(self) -> None:
        manager = make_manager()
        server.ws_manager = manager

        with TestClient(app) as client:
            connection_one = ConnectionState(connection_id="conn-1", websocket=DummyWebSocket())
            connection_two = ConnectionState(connection_id="conn-2", websocket=DummyWebSocket())

            subscription_one = make_subscription("sub-1", ["PV:ONE", "PV:TWO"])
            subscription_two = make_subscription("sub-2", ["PV:ONE"])

            key_one = MonitorKey(
                pv_name="PV:ONE",
                detail=subscription_one.options.detail,
                datatype_alias=subscription_one.options.datatype_alias.value if subscription_one.options.datatype_alias else None,
                count=subscription_one.options.count,
                timeout=subscription_one.options.timeout,
                all_updates=subscription_one.options.all_updates,
                notify_disconnect=subscription_one.options.notify_disconnect,
            )
            key_two = MonitorKey(
                pv_name="PV:TWO",
                detail=subscription_one.options.detail,
                datatype_alias=subscription_one.options.datatype_alias.value if subscription_one.options.datatype_alias else None,
                count=subscription_one.options.count,
                timeout=subscription_one.options.timeout,
                all_updates=subscription_one.options.all_updates,
                notify_disconnect=subscription_one.options.notify_disconnect,
            )

            subscription_one.monitor_keys.extend([key_one, key_two])
            subscription_two.monitor_keys.append(key_one)

            connection_one.subscriptions["sub-1"] = subscription_one
            connection_two.subscriptions["sub-2"] = subscription_two
            manager.connections = {
                connection_one.connection_id: connection_one,
                connection_two.connection_id: connection_two,
            }

            manager.monitors = {
                key_one: MonitorRecord(
                    key=key_one,
                    subscription=DummySubscription(),
                    subscribers={
                        SubscriberRef(connection_id="conn-1", subscription_id="sub-1"),
                        SubscriberRef(connection_id="conn-2", subscription_id="sub-2"),
                    },
                    last_value=DummyPVValue(42.5),
                ),
                key_two: MonitorRecord(
                    key=key_two,
                    subscription=DummySubscription(),
                    subscribers={
                        SubscriberRef(connection_id="conn-1", subscription_id="sub-1"),
                    },
                    last_value=None,
                ),
            }

            response = client.get("/stats")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ready"])
        self.assertEqual(payload["active_connections"], 2)
        self.assertEqual(payload["active_monitors"], 2)
        self.assertEqual(payload["total_client_subscriptions"], 2)
        self.assertEqual(payload["total_subscribers"], 3)
        self.assertEqual([connection["connection_id"] for connection in payload["connections"]], ["conn-1", "conn-2"])
        self.assertEqual(payload["connections"][0]["subscriptions"][0]["pvs"], ["PV:ONE", "PV:TWO"])
        self.assertEqual(payload["monitors"][0]["pv_name"], "PV:ONE")
        self.assertEqual(payload["monitors"][0]["subscriber_count"], 2)
        self.assertTrue(payload["monitors"][0]["has_cached_value"])
        self.assertEqual(payload["monitors"][0]["last_value"]["value"], 42.5)
        self.assertEqual(payload["monitors"][1]["pv_name"], "PV:TWO")
        self.assertFalse(payload["monitors"][1]["has_cached_value"])
        self.assertIsNone(payload["monitors"][1]["last_value"])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import logging
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import server
from app_settings import AppSettings
from server import app
from websocket_pv_manager import WebSocketPVsManager


class DummySubscription:
    def close(self) -> None:
        return None


def make_manager() -> WebSocketPVsManager:
    manager = WebSocketPVsManager(
        logger=logging.getLogger("test-compat"),
        settings=AppSettings(),
    )
    manager._create_monitor = lambda *_args, **_kwargs: DummySubscription()  # type: ignore[method-assign]
    return manager


class ProtocolCompatibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_manager = server.ws_manager

    def tearDown(self) -> None:
        server.ws_manager = self.original_manager

    def test_legacy_websocket_subscribe_receives_pv_message(self) -> None:
        manager = make_manager()
        server.ws_manager = manager
        fake_snapshot = {
            "type": "result",
            "operation": "monitor",
            "subscription_id": "legacy:AI_TEMP",
            "pv": "AI_TEMP",
            "detail": "control",
            "ok": True,
            "value": 21.5,
            "metadata": {
                "severity": 0,
                "units": "°C",
                "timestamp": 1711962000.0,
            },
        }

        with patch("websocket_pv_manager.get_once", new=AsyncMock(return_value=fake_snapshot)):
            with TestClient(app) as client:
                with client.websocket_connect("/ws/pvs?auth=test-token") as websocket:
                    connected = websocket.receive_json()
                    self.assertEqual(connected["type"], "connected")

                    websocket.send_json({"type": "subscribe", "pvs": {"AI_TEMP": True}})
                    _subscribed = websocket.receive_json()
                    pv_payload = websocket.receive_json()

                    self.assertEqual(pv_payload["type"], "pv")
                    self.assertEqual(pv_payload["name"], "AI_TEMP")
                    self.assertEqual(pv_payload["value"], 21.5)
                    self.assertEqual(pv_payload["units"], "°C")
                    self.assertTrue(pv_payload["ok"])

    def test_write_endpoint_requires_auth(self) -> None:
        server.ws_manager = make_manager()
        with TestClient(app) as client:
            response = client.post("/pv/AI_TEST", json={"value": 1})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["ok"], False)

    def test_write_endpoint_writes_with_auth(self) -> None:
        server.ws_manager = make_manager()
        with patch("server.put_once", new=AsyncMock()) as put_once:
            with TestClient(app) as client:
                response = client.post(
                    "/pv/CMD_NL2_START_LASER",
                    json={"value": 1},
                    headers={"Authorization": "******"},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        put_once.assert_awaited_once()

    def test_waveforms_endpoint_matches_mock_shape(self) -> None:
        server.ws_manager = make_manager()
        with TestClient(app) as client:
            unauthorized = client.get("/waveforms")
            authorized = client.get("/waveforms", headers={"Authorization": "******"})

        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(authorized.status_code, 200)
        self.assertTrue(isinstance(authorized.json(), list))
        self.assertIn("std-100ps", authorized.json())


if __name__ == "__main__":
    unittest.main()

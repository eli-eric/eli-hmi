from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

import aioca
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError

from aioca_api import ResolvedReadOptions, get_once, resolve_read_options
from api_contract import (
    CachedMonitorValue,
    ConnectionSnapshot,
    ConnectionSubscriptionSnapshot,
    DetailLevel,
    ErrorInfo,
    InboundMessage,
    MonitorSnapshot,
    MonitorSubscriberSnapshot,
    PingMessage,
    StatsResponse,
    SubscribeMessage,
    UnsubscribeMessage,
)
from app_settings import AppSettings
from pv_serialization import build_pv_payload, build_pv_response, error_payload, generic_error_payload


@dataclass(frozen=True)
class MonitorKey:
    pv_name: str
    detail: DetailLevel
    datatype_alias: str | None
    count: int
    timeout: float | None
    all_updates: bool
    notify_disconnect: bool


@dataclass(frozen=True)
class SubscriberRef:
    connection_id: str
    subscription_id: str


@dataclass
class ClientSubscription:
    request: SubscribeMessage
    options: ResolvedReadOptions
    monitor_keys: list[MonitorKey]


@dataclass
class MonitorRecord:
    key: MonitorKey
    subscription: aioca.Subscription
    subscribers: set[SubscriberRef] = field(default_factory=set)
    last_value: Any | None = None


@dataclass
class ConnectionState:
    connection_id: str
    websocket: WebSocket
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    subscriptions: dict[str, ClientSubscription] = field(default_factory=dict)


class WebSocketPVsManager:
    def __init__(self, logger: logging.Logger, settings: AppSettings):
        self.logger = logger
        self.settings = settings
        self.connections: dict[str, ConnectionState] = {}
        self.monitors: dict[MonitorKey, MonitorRecord] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self._message_adapter = TypeAdapter(InboundMessage)
        self._lock = asyncio.Lock()
        self.ready = False

    async def startup(self) -> None:
        self.loop = asyncio.get_running_loop()
        self.ready = True
        self.logger.info("WebSocket PV manager ready")

    async def shutdown(self) -> None:
        self.ready = False
        async with self._lock:
            monitor_items = list(self.monitors.items())
            connection_items = list(self.connections.items())
            self.monitors.clear()
            self.connections.clear()

        for _, record in monitor_items:
            try:
                record.subscription.close()
            except Exception:
                self.logger.exception("Failed to close monitor for PV %s", record.key.pv_name)

        for _, connection in connection_items:
            try:
                await connection.websocket.close(code=1001)
            except Exception:
                self.logger.debug("Connection %s already closed", connection.connection_id)

        try:
            aioca.purge_channel_caches()
        except Exception:
            self.logger.exception("Failed to purge aioca channel caches")

        self.logger.info("WebSocket PV manager shut down")

    async def get_stats_snapshot(self) -> StatsResponse:
        async with self._lock:
            connections: list[ConnectionSnapshot] = []
            total_client_subscriptions = 0

            for connection_id, connection in sorted(self.connections.items()):
                subscriptions: list[ConnectionSubscriptionSnapshot] = []
                for subscription_id, client_subscription in sorted(connection.subscriptions.items()):
                    options = client_subscription.options
                    subscriptions.append(
                        ConnectionSubscriptionSnapshot(
                            subscription_id=subscription_id,
                            pvs=list(client_subscription.request.pvs),
                            detail=options.detail,
                            datatype=options.datatype_alias,
                            count=options.count,
                            timeout=options.timeout,
                            all_updates=options.all_updates,
                            notify_disconnect=options.notify_disconnect,
                            monitor_count=len(client_subscription.monitor_keys),
                        )
                    )

                total_client_subscriptions += len(subscriptions)
                connections.append(
                    ConnectionSnapshot(
                        connection_id=connection_id,
                        subscription_count=len(subscriptions),
                        subscriptions=subscriptions,
                    )
                )

            monitors: list[MonitorSnapshot] = []
            total_subscribers = 0
            monitor_items = sorted(
                self.monitors.items(),
                key=lambda item: (
                    item[0].pv_name,
                    item[0].detail.value,
                    item[0].datatype_alias or "",
                    item[0].count,
                    item[0].timeout if item[0].timeout is not None else -1.0,
                    item[0].all_updates,
                    item[0].notify_disconnect,
                ),
            )
            for key, record in monitor_items:
                subscribers = sorted(
                    record.subscribers,
                    key=lambda subscriber: (subscriber.connection_id, subscriber.subscription_id),
                )
                subscriber_snapshots = [
                    MonitorSubscriberSnapshot(
                        connection_id=subscriber.connection_id,
                        subscription_id=subscriber.subscription_id,
                    )
                    for subscriber in subscribers
                ]
                total_subscribers += len(subscriber_snapshots)
                monitors.append(
                    MonitorSnapshot(
                        pv_name=key.pv_name,
                        detail=key.detail,
                        datatype=key.datatype_alias,
                        count=key.count,
                        timeout=key.timeout,
                        all_updates=key.all_updates,
                        notify_disconnect=key.notify_disconnect,
                        subscriber_count=len(subscriber_snapshots),
                        subscribers=subscriber_snapshots,
                        has_cached_value=record.last_value is not None,
                        last_value=self._build_cached_monitor_value(key, record.last_value),
                    )
                )

            return StatsResponse(
                ready=self.ready,
                active_connections=len(connections),
                active_monitors=len(monitors),
                total_client_subscriptions=total_client_subscriptions,
                total_subscribers=total_subscribers,
                connections=connections,
                monitors=monitors,
            )

    async def websocket_handler(self, websocket: WebSocket) -> None:
        connection = await self._accept_connection(websocket)
        try:
            while True:
                payload = await websocket.receive_json()
                await self._handle_message(connection.connection_id, payload)
        except WebSocketDisconnect:
            self.logger.info("WebSocket disconnected", extra={"connection_id": connection.connection_id})
        except Exception:
            self.logger.exception("Unexpected websocket failure", extra={"connection_id": connection.connection_id})
            await self._safe_send(
                connection,
                {
                    "type": "error",
                    "operation": "monitor",
                    "error": {"code": "internal_error", "message": "Unexpected websocket failure"},
                },
            )
        finally:
            await self._disconnect(connection.connection_id)

    async def _accept_connection(self, websocket: WebSocket) -> ConnectionState:
        await websocket.accept()
        connection_id = uuid4().hex[:12]
        connection = ConnectionState(connection_id=connection_id, websocket=websocket)
        async with self._lock:
            self.connections[connection_id] = connection
        self.logger.info("WebSocket connected", extra={"connection_id": connection_id})
        await self._safe_send(
            connection,
            {
                "type": "connected",
                "operation": "monitor",
                "connection_id": connection_id,
                "limits": {
                    "max_pvs_per_subscription": self.settings.max_pvs_per_subscription,
                    "max_subscriptions_per_connection": self.settings.max_subscriptions_per_connection,
                },
            },
        )
        return connection

    async def _handle_message(self, connection_id: str, payload: dict[str, Any]) -> None:
        connection = self.connections.get(connection_id)
        if connection is None:
            return

        try:
            message = self._message_adapter.validate_python(payload)
        except ValidationError as exc:
            await self._safe_send(
                connection,
                {
                    "type": "error",
                    "operation": "monitor",
                    "error": {"code": "invalid_message", "message": exc.errors()},
                },
            )
            return

        if isinstance(message, PingMessage):
            await self._safe_send(
                connection,
                {"type": "pong", "operation": "monitor", "nonce": message.nonce},
            )
            return

        if isinstance(message, UnsubscribeMessage):
            removed = await self._unsubscribe(connection_id, message.subscription_id)
            await self._safe_send(
                connection,
                {
                    "type": "unsubscribed",
                    "operation": "monitor",
                    "subscription_id": message.subscription_id,
                    "ok": removed,
                },
            )
            return

        if isinstance(message, SubscribeMessage):
            await self._subscribe(connection_id, message)

    async def _subscribe(self, connection_id: str, message: SubscribeMessage) -> None:
        connection = self.connections.get(connection_id)
        if connection is None:
            return

        if len(message.pvs) > self.settings.max_pvs_per_subscription:
            await self._safe_send(
                connection,
                {
                    "type": "error",
                    "operation": "monitor",
                    "subscription_id": message.subscription_id,
                    "error": {
                        "code": "too_many_pvs",
                        "message": f"A subscription can monitor at most {self.settings.max_pvs_per_subscription} PVs",
                    },
                },
            )
            return

        if (
            message.subscription_id not in connection.subscriptions
            and len(connection.subscriptions) >= self.settings.max_subscriptions_per_connection
        ):
            await self._safe_send(
                connection,
                {
                    "type": "error",
                    "operation": "monitor",
                    "subscription_id": message.subscription_id,
                    "error": {
                        "code": "too_many_subscriptions",
                        "message": (f"A connection can hold at most {self.settings.max_subscriptions_per_connection} subscriptions"),
                    },
                },
            )
            return

        await self._unsubscribe(connection_id, message.subscription_id)

        options = resolve_read_options(
            message,
            default_timeout=self.settings.default_timeout,
            max_timeout=self.settings.max_timeout,
            all_updates=message.all_updates,
            notify_disconnect=message.notify_disconnect,
        )

        client_subscription = ClientSubscription(
            request=message,
            options=options,
            monitor_keys=[],
        )

        subscriber_ref = SubscriberRef(
            connection_id=connection_id,
            subscription_id=message.subscription_id,
        )

        created_records: list[MonitorKey] = []
        try:
            async with self._lock:
                for pv_name in message.pvs:
                    key = MonitorKey(
                        pv_name=pv_name,
                        detail=options.detail,
                        datatype_alias=options.datatype_alias.value if options.datatype_alias else None,
                        count=options.count,
                        timeout=options.timeout,
                        all_updates=options.all_updates,
                        notify_disconnect=options.notify_disconnect,
                    )
                    record = self.monitors.get(key)
                    if record is None:
                        record = MonitorRecord(
                            key=key,
                            subscription=self._create_monitor(key, options),
                        )
                        self.monitors[key] = record
                        created_records.append(key)
                    record.subscribers.add(subscriber_ref)
                    client_subscription.monitor_keys.append(key)
                connection.subscriptions[message.subscription_id] = client_subscription
        except Exception:
            self.logger.exception(
                "Failed to register subscription",
                extra={"connection_id": connection_id, "subscription_id": message.subscription_id},
            )
            async with self._lock:
                for key in created_records:
                    record = self.monitors.pop(key, None)
                    if record is not None:
                        try:
                            record.subscription.close()
                        except Exception:
                            self.logger.exception("Failed to roll back monitor for PV %s", key.pv_name)
            await self._safe_send(
                connection,
                {
                    "type": "error",
                    "operation": "monitor",
                    "subscription_id": message.subscription_id,
                    **generic_error_payload("subscription_failed", "Failed to register subscription"),
                },
            )
            return

        self.logger.info(
            "Subscription registered",
            extra={
                "connection_id": connection_id,
                "subscription_id": message.subscription_id,
                "pvs": message.pvs,
                "detail": message.detail.value,
            },
        )

        await self._safe_send(
            connection,
            {
                "type": "subscribed",
                "operation": "monitor",
                "subscription_id": message.subscription_id,
                "detail": message.detail.value,
                "pvs": message.pvs,
                "ok": True,
            },
        )

        for pv_name in message.pvs:
            await self._send_snapshot(connection, message.subscription_id, pv_name, options)

    async def _unsubscribe(self, connection_id: str, subscription_id: str) -> bool:
        async with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return False

            client_subscription = connection.subscriptions.pop(subscription_id, None)
            if client_subscription is None:
                return False

            subscriber_ref = SubscriberRef(connection_id=connection_id, subscription_id=subscription_id)
            empty_monitors: list[MonitorKey] = []
            for key in client_subscription.monitor_keys:
                record = self.monitors.get(key)
                if record is None:
                    continue
                record.subscribers.discard(subscriber_ref)
                if not record.subscribers:
                    empty_monitors.append(key)

            for key in empty_monitors:
                record = self.monitors.pop(key)
                try:
                    record.subscription.close()
                except Exception:
                    self.logger.exception("Failed to close monitor for PV %s", key.pv_name)

        self.logger.info(
            "Subscription removed",
            extra={"connection_id": connection_id, "subscription_id": subscription_id},
        )
        return True

    def _create_monitor(self, key: MonitorKey, options: ResolvedReadOptions) -> aioca.Subscription:
        if self.loop is None:
            raise RuntimeError("WebSocketPVsManager.startup() must be called before creating monitors")

        def callback(value: Any) -> None:
            self.loop.call_soon_threadsafe(self._schedule_monitor_dispatch, key, value)

        return aioca.camonitor(
            key.pv_name,
            callback,
            datatype=options.datatype,
            format=options.format_code,
            count=options.count,
            all_updates=options.all_updates,
            notify_disconnect=options.notify_disconnect,
            connect_timeout=options.timeout,
        )

    def _schedule_monitor_dispatch(self, key: MonitorKey, value: Any) -> None:
        asyncio.create_task(self._dispatch_monitor_value(key, value))

    async def _dispatch_monitor_value(self, key: MonitorKey, value: Any) -> None:
        async with self._lock:
            record = self.monitors.get(key)
            if record is None:
                return
            record.last_value = value
            subscribers = list(record.subscribers)

        payload = self._monitor_payload(key, value)
        for subscriber in subscribers:
            connection = self.connections.get(subscriber.connection_id)
            if connection is None:
                continue
            await self._safe_send(
                connection,
                {
                    **payload,
                    "subscription_id": subscriber.subscription_id,
                },
            )

    def _monitor_payload(self, key: MonitorKey, value: Any) -> dict[str, Any]:
        if value.ok:
            return build_pv_response(
                operation="monitor",
                event="event",
                pv_name=key.pv_name,
                detail=key.detail,
                ok=True,
                payload=build_pv_payload(value, detail=key.detail),
            )
        return build_pv_response(
            operation="monitor",
            event="event",
            pv_name=key.pv_name,
            detail=key.detail,
            ok=False,
            payload=error_payload(value),
        )

    def _build_cached_monitor_value(self, key: MonitorKey, value: Any | None) -> CachedMonitorValue | None:
        if value is None:
            return None

        if value.ok:
            payload = build_pv_payload(value, detail=key.detail)
            return CachedMonitorValue(
                ok=True,
                value=payload["value"],
                metadata=payload["metadata"],
            )

        error = error_payload(value)["error"]
        return CachedMonitorValue(
            ok=False,
            error=ErrorInfo(code=error["code"], message=error["message"]),
        )

    async def _send_snapshot(
        self,
        connection: ConnectionState,
        subscription_id: str,
        pv_name: str,
        options: ResolvedReadOptions,
    ) -> None:
        try:
            response = await get_once(pv_name, options)
        except Exception:
            self.logger.exception(
                "Failed to get initial snapshot",
                extra={"connection_id": connection.connection_id, "subscription_id": subscription_id, "pv": pv_name},
            )
            response = build_pv_response(
                operation="monitor",
                event="snapshot",
                pv_name=pv_name,
                detail=options.detail,
                ok=False,
                payload=generic_error_payload("snapshot_failed", "Failed to fetch initial snapshot"),
                subscription_id=subscription_id,
            )
            await self._safe_send(connection, response)
            return

        response["type"] = "snapshot"
        response["operation"] = "monitor"
        response["subscription_id"] = subscription_id
        await self._safe_send(connection, response)

    async def _safe_send(self, connection: ConnectionState, payload: dict[str, Any]) -> None:
        async with connection.send_lock:
            try:
                await connection.websocket.send_json(payload)
            except RuntimeError:
                self.logger.info(
                    "WebSocket already closed while sending",
                    extra={"connection_id": connection.connection_id},
                )
                asyncio.create_task(self._disconnect(connection.connection_id))
            except Exception:
                self.logger.exception(
                    "Failed to send websocket message",
                    extra={"connection_id": connection.connection_id},
                )
                asyncio.create_task(self._disconnect(connection.connection_id))

    async def _disconnect(self, connection_id: str) -> None:
        connection = self.connections.get(connection_id)
        if connection is None:
            return

        for subscription_id in list(connection.subscriptions):
            await self._unsubscribe(connection_id, subscription_id)

        async with self._lock:
            self.connections.pop(connection_id, None)

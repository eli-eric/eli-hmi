"""
This module contains the WebSocketManager class, which manages WebSocket connections and their associated process variables (PVs).
"""

import logging
from typing import Any
from fastapi import WebSocket, WebSocketDisconnect
import aioca


@dataclass
class WSMessage:
    """
    A class to represent a WebSocket message.

    Attributes:
        type (str): The type of the message.
        data (Any): The data of the message.
    """

    type: str
    data: Any


@dataclass
class SubRecord:
    """
    A class to represent a subscription record.

    Attributes:
        sub (aioca.Subscription): The subscription object.
        cnt (int): The count of subscriptions. Defaults to 1.
    """

    sub: aioca.Subscription
    cnt: int = 1


class WebSocketPVsManager:
    """
    WebSocketPVsManager is a class that manages WebSocket connections and subscriptions to process variables (PVs).

    Attributes:
        active_connections (list[WebSocket]): A list of active WebSocket connections.
        pvs (dict[WebSocket, list[str]]): A dictionary mapping WebSocket connections to lists of PV names.
        logger (logging.Logger): A logger instance for logging messages.
        subscriptions (dict[str, SubRecord]): A dictionary mapping PV names to subscription records.
        last_values_cache (dict[str, aioca.types.AugmentedValue]): A cache of the last values of PVs.

    Methods:
        __init__(logger: logging.Logger):
            Initializes the WebSocketPVsManager with a logger.

        websocket_handler(websocket: WebSocket):

        disconnect(websocket: WebSocket):
            Disconnects a WebSocket from the active connections.

        broadcast(value: Any):
            Broadcasts a given value to all active WebSocket connections.

        register_pvs(websocket: WebSocket, pvs: list[str]):
            Registers a list of process variables (PVs) for a given WebSocket connection.

        add_subscription(pv_name: str):

        remove_subscription(pv_name: str):

        get_subscription(pv_name: str):

        close_all():

        pv_callback(value: aioca.types.AugmentedValue):
    """

    def __init__(self, logger: logging.Logger):
        self.active_connections: list[WebSocket] = []
        self.pv_websockets: dict[str, list[WebSocket]] = {}
        self.logger = logger
        self.subscriptions: dict[str, SubRecord] = {}
        self.last_values_cache: dict[str, aioca.types.AugmentedValue] = {}

    async def websocket_handler(self, websocket: WebSocket):
        """
        Handles the lifecycle of a WebSocket connection.

        This method is an asynchronous handler for managing WebSocket connections.
        It attempts to handle the connection, and in case of a disconnection or
        any unexpected error, it calls the appropriate handler methods.

        Args:
            websocket (WebSocket): The WebSocket connection instance.

        Raises:
            WebSocketDisconnect: If the WebSocket connection is disconnected.
            Exception: For any unexpected errors during the connection handling.
        """
        try:
            await self._handle_connection(websocket)
        except WebSocketDisconnect:
            await self._handle_disconnection(websocket)
        except Exception as e:
            await self._handle_unexpected_error(websocket, e)

    async def _handle_connection(self, websocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.logger.info("WebSocket connected")

        while True:
            data = await websocket.receive_json()
            self.logger.info("Received data: %s", data)
            if data["type"] == "subscribe":
                await self._handle_subscription(websocket, data["pvs"])

    async def _handle_subscription(self, websocket, pvs):
        self.register_pvs(websocket, pvs)
        for pv in pvs:
            self.add_subscription(pv)
            self.logger.info("Added subscription for PV: %s", pv)
            await self._send_pv_data(pv)

    async def _send_pv_data(self, pv):
        last_value = self.last_values_cache.get(pv)
        if last_value is not None:
            await self._broadcast_cached_value(pv, last_value)
        else:
            await self._fetch_and_broadcast_value(pv)

    async def _broadcast_cached_value(self, pv, last_value):
        self.logger.debug("Using cached value for PV %s: %s", pv, last_value)
        data = {
            "type": "pv",
            "name": pv,
            "value": last_value,  # Ensure it's JSON serializable
            "severity": last_value.severity,
            "ok": last_value.ok,
        }
        await self.broadcast(data)

    async def _fetch_and_broadcast_value(self, pv):
        try:
            val = await aioca.caget(pv, format=2)
            self.logger.info("Fetched value for PV %s: %s", pv, val)
            self.last_values_cache[pv] = val
            data = {
                "type": "pv",
                "name": pv,
                "value": val,  # Ensure it's JSON serializable
                "severity": val.severity,
                "ok": val.ok,
            }
            await self.broadcast(data)
        except Exception as e:
            self.logger.error("Failed to fetch PV %s: %s", pv, str(e))

            data = {
                "type": "pv",
                "name": pv,
                "value": None,
                "severity": 0,
                "ok": False,
            }
            await self.broadcast(data)

    async def _handle_disconnection(self, websocket):
        self.logger.info("WebSocket disconnected for test client")
        for pv in self.unregister_pvs(websocket):
            self.remove_subscription(pv)
            self.logger.info("Removed subscription for PV: %s", pv)
        self.disconnect(websocket)

    async def _handle_unexpected_error(self, websocket, e):
        self.logger.exception("Unexpected error in WebSocket: %s", e)
        await websocket.send_json({"error": "An unexpected error occurred. Please try again later."})

    def disconnect(self, websocket: WebSocket):
        """
        Disconnects a websocket from the active connections.

        Args:
            websocket (WebSocket): The websocket to be disconnected.
        """
        self.active_connections.remove(websocket)

    # will broadcast to all websockets that are connected and have value.name in their list of pvs
    async def broadcast(self, value: Any):
        """
        Broadcasts a given value to all connected websockets associated with the value's name.

        Args:
            value (Any): The value to be broadcasted. It is expected to be a dictionary containing a "name" key.

        Raises:
            Exception: If an unexpected error occurs during broadcasting, it will be logged.
        """
        web_sockets_to_send = self.pv_websockets.get(value["name"])
        if not web_sockets_to_send:
            return
        # Iterate over a copy of the list to avoid issues with modifying the list during iteration.
        for ws in web_sockets_to_send.copy():
            try:
                await ws.send_json(value)
            except RuntimeError as e:
                # Check if the error is due to a closed websocket.
                if "websocket.send" in str(e):
                    self.logger.info("Detected closed websocket, removing from broadcast list.")
                    web_sockets_to_send.remove(ws)
                else:
                    self.logger.exception("Unexpected RuntimeError while sending to websocket: %s", e)
            except Exception as e:
                self.logger.exception("Unexpected error while sending to websocket: %s", e)

    def register_pvs(self, websocket: WebSocket, pvs: list[str]):
        """
        Registers a list of process variables (PVs) to a given WebSocket connection.

        This method associates each PV in the provided list with the given WebSocket.
        If a PV is already associated with other WebSocket connections, the new WebSocket
        is added to the existing list. If the PV is not yet associated with any WebSocket,
        a new list is created with the given WebSocket as its first element.

        Args:
            websocket (WebSocket): The WebSocket connection to register the PVs with.
            pvs (list[str]): A list of process variable names to register.

        Returns:
            None
        """

        for pv in pvs:
            ws_list = self.pv_websockets.get(pv)
            if ws_list is None:
                self.pv_websockets[pv] = [websocket]
            else:
                ws_list.append(websocket)
                self.pv_websockets[pv] = ws_list

        self.logger.info("Registered PVs for WebSocket: %s", pvs)

    def unregister_pvs(self, websocket: WebSocket) -> list[str]:
        """
        Unregisters all process variables (PVs) associated with a given WebSocket connection.

        This method removes the given WebSocket from the list of WebSocket connections associated with each PV.
        It then removes the PVs associated with the WebSocket from the dictionary of WebSocket-PV associations.

        Args:
            websocket (WebSocket): The WebSocket connection to unregister the PVs from.

        Returns:
            list[str]: A list of PV names that were unregistered from the WebSocket connection.
        """
        unregistered_pvs = []
        for pv, ws_list in self.pv_websockets.items():
            if websocket in ws_list:
                ws_list.remove(websocket)
                self.pv_websockets[pv] = ws_list
                unregistered_pvs.append(pv)

        self.logger.info("Unregistered PVs for WebSocket: %s", unregistered_pvs)
        return unregistered_pvs

    def add_subscription(self, pv_name: str):
        """
        Adds a subscription for the given process variable (PV) name.

        This method checks if a subscription for the specified PV name already exists.
        If it does, it increments the subscription count. If it does not, it attempts
        to create a new subscription and adds it to the subscriptions dictionary.

        Args:
            pv_name (str): The name of the process variable to subscribe to.

        Returns:
            SubRecord: The subscription record for the given PV name if successful.
            None: If an error occurs while adding the subscription.

        Raises:
            Exception: Logs any unexpected errors that occur during the subscription process.
        """
        try:
            # Check if subscription already exists
            sub_exists = self.subscriptions.get(pv_name)
            if sub_exists is not None:
                sub_exists.cnt += 1
                self.logger.info("Incremented subscription count for PV: %s, count: %d", pv_name, sub_exists.cnt)
                return sub_exists
            # Attempt to create a new subscription
            subscription = aioca.camonitor(pv_name, self.pv_callback, format=1, notify_disconnect=True)
            self.subscriptions[pv_name] = SubRecord(subscription)
            self.logger.info("Added new subscription for PV: %s", pv_name)

            return self.subscriptions[pv_name]

        except Exception as e:
            self.logger.exception("Unexpected error while adding subscription for PV %s: %s", pv_name, str(e))
            return None

    def remove_subscription(self, pv_name: str):
        """
        Removes a subscription for the given process variable (PV) name.

        This method decrements the subscription count for the specified PV name.
        If the count reaches zero, the subscription is closed and removed from the
        subscriptions dictionary.

        Args:
            pv_name (str): The name of the process variable for which the subscription
                           should be removed.

        Logs:
            - Info: When the subscription count is decremented.
            - Info: When the subscription is removed.
            - Warning: If an attempt is made to remove a non-existent subscription.
            - Exception: If an unexpected error occurs during the removal process.
        """
        try:
            # Retrieve the subscription
            sub = self.subscriptions.get(pv_name)
            if sub is not None:
                sub.cnt -= 1
                self.logger.info("Decremented subscription count for PV: %s, count: %d", pv_name, sub.cnt)
                if sub.cnt == 0:
                    # Close and delete the subscription if count reaches zero
                    sub.sub.close()
                    del self.subscriptions[pv_name]
                    self.logger.info("Removed subscription for PV: %s", pv_name)
            else:
                self.logger.warning("Attempted to remove non-existent subscription for PV: %s", pv_name)

        except Exception as e:
            self.logger.exception("Unexpected error while removing subscription for PV %s: %s", pv_name, str(e))

    def get_subscription(self, pv_name: str):
        """
        Retrieves the subscription for the given process variable (PV) name.

        This method checks if a subscription for the specified PV name exists.
        If it does, it logs the access and returns the subscription record.
        If it does not, it logs a warning.

        Args:
            pv_name (str): The name of the process variable to retrieve the subscription for.

        Returns:
            SubRecord: The subscription record for the given PV name if it exists.
            None: If the subscription does not exist.
        """
        # Retrieve and log the access to a subscription
        subscription = self.subscriptions.get(pv_name)
        if subscription is None:
            self.logger.warning("No subscription found for PV: %s", pv_name)
        else:
            self.logger.info("Retrieved subscription for PV: %s", pv_name)

        return subscription

    def close_all(self):
        """
        Closes all active subscriptions and clears the subscriptions dictionary.

        This method attempts to close each subscription in the `self.subscriptions` dictionary.
        It logs the closure of each subscription and clears the dictionary afterward.
        If an exception occurs during the process, it logs the exception.

        Raises:
            Exception: If an unexpected error occurs while closing subscriptions.
        """
        try:
            # Attempt to close all subscriptions
            for pv_name, sub in self.subscriptions.items():
                sub.sub.close()
                self.logger.info("Closed subscription for PV: %s", pv_name)
            self.subscriptions.clear()
            self.logger.info("All subscriptions closed and cleared.")

        except Exception as e:
            self.logger.exception("Unexpected error while closing all subscriptions: %s", str(e))

    async def pv_callback(self, value: aioca.types.AugmentedValue):
        """
        Asynchronous callback function for processing and broadcasting process variable (PV) updates.

        Args:
            value (aioca.types.AugmentedValue): The updated value of the process variable, which includes
                                                attributes such as name, value, and severity.

        Updates:
            - Updates the last value cache with the new process variable value.
            - Broadcasts the new value to all connected clients via the websocket manager.

        Note:
            The value is converted to a string to ensure it is JSON serializable before broadcasting.
        """
        # Update the last value cache and broadcast the new value
        if value.ok:
            # Convert ca_array to a list if necessary
            if hasattr(value, "tolist"):
                serializable_value = value.tolist()
            else:
                serializable_value = value

            self.last_values_cache[value.name] = value

            data = {
                "type": "pv",
                "name": value.name,
                "value": serializable_value,  # Convert value to string to ensure it's JSON serializable
                "severity": value.severity,
                "ok": value.ok,
            }
            await self.broadcast(data)
        else:
            # logging the error
            self.logger.error("Error in PV callback: %s", value)

            data = {
                "type": "pv",
                "name": value.name,
                "value": None,
                "severity": 0,
                "ok": False,
            }

            await self.broadcast(data)

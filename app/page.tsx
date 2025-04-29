"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function SocketPage() {
  const [connected, setConnected] = useState(false);
  const [binaryStream, setBinaryStream] = useState<number[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [, setError] = useState<string | null>(null);

  // Clean up socket connection when component unmounts
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  const connectSocket = () => {
    // Reset error state
    setError(null);
    try {
      // Initialize Socket.IO - first make a request to initialize server
      fetch("/").finally(() => {
        // Create Socket.IO connection
        const socketClient = io();
        setSocket(socketClient);
        // Handle connection open
        socketClient.on("connect", () => {
          console.log("Socket.IO connection established");
          setConnected(true);
          setError(null);
        });
        // Handle binary data
        socketClient.on("binary-stream", (data) => {
          try {
            setBinaryStream((prev) => {
              const newStream = [...prev, data.bit];
              // Keep only the last 50 bits to avoid overwhelming the UI
              return newStream.slice(-50);
            });
          } catch (err) {
            console.error("Error handling Socket.IO message:", err);
          }
        });
        // Handle errors
        socketClient.on("connect_error", (err) => {
          console.error("Socket.IO connection error:", err);
          setError("Connection error. Please try again.");
          socketClient.disconnect();
          setSocket(null);
          setConnected(false);
        });
        // Handle disconnection
        socketClient.on("disconnect", () => {
          console.log("Socket.IO disconnected");
          setConnected(false);
        });
      });
    } catch (err) {
      console.error("Error initializing Socket.IO:", err);
      setError("Failed to initialize connection");
    }
  };

  const disconnectSocket = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    }
  };

  return (
    <main>
      <div>
        <div>
          <div></div>
          <span>Status: {connected ? "Connected" : "Disconnected"}</span>
        </div>
        {!connected ? (
          <button onClick={connectSocket}>Connect</button>
        ) : (
          <button onClick={disconnectSocket}>Disconnect</button>
        )}
      </div>
      <div>
        <h3>Incoming Binary Stream (Socket.IO):</h3>
        <div>
          {binaryStream.length > 0 ? (
            binaryStream.map((bit, index) => <span key={index}>{bit}</span>)
          ) : (
            <p>No data received yet. Connect to start streaming.</p>
          )}
        </div>
      </div>
      <div>
        <p>
          The server will stream random binary digits (0s and 1s) every second
          using Socket.IO.
        </p>
      </div>
    </main>
  );
}

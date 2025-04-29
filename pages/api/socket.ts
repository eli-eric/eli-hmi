import { Server as IOServer } from "socket.io";
import { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer } from "http";
import type { Socket as NetSocket } from "net";

// Define interfaces for extended types
interface ServerSocket extends NetSocket {
  server: HTTPServer & {
    io?: IOServer;
  };
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: ServerSocket;
}

export default function SocketHandler(
  _: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  // Check if socket.io server is already running
  if (res.socket.server.io) {
    console.log("Socket server already running");
    res.end();
    return;
  }

  console.log("Setting up socket server");

  // Create new socket.io instance
  const io = new IOServer(res.socket.server);

  // Store the io instance on the server object
  res.socket.server.io = io;

  // Handle socket connections
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send binary data every second
    const interval = setInterval(() => {
      const bit = Math.round(Math.random());
      socket.emit("binary-stream", { bit });
    }, 1000);

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      clearInterval(interval);
    });
  });

  res.end();
}

import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    console.log("A user connected");
    socket.on("disconnect", () => {
      console.log("A user disconnected");
    });

    socket.on("message", (msg) => {
      console.log("Message received: ", msg);
    });
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
  // Handle incoming requests
  //eslint-disable-next-line @typescript-eslint/no-unused-vars
  httpServer.on("request", (req, res) => {
    // Handle the request and response here
    // For example, you can log the request method and URL
    console.log(`${req.method} ${req.url}`);
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});

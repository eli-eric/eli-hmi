# ELI Beamlines Control System GUI

This project is an application designed for **control system operators** and **control system engineers** at ELI Beamlines. It provides a user-friendly interface for operators and an easy-to-setup GUI framework for engineers who may not be web frontend developers.

# Project structure

## Frontend

folder: `frontend`

The frontend is built using Next.js and TypeScript. It includes a set of reusable components for building GUIs for control system operators.
The components are designed to be easy to use and can be combined to create complex UIs. The frontend communicates with the backend using WebSocket connections.
The WebSocket API is designed to be simple and intuitive, allowing for easy integration with the frontend components.

## Mockup WebSocket Server

folder: `mockup-websocket-server`
The mockup WebSocket server is a simple Go application that simulates the behavior of a control system. It provides a WebSocket API for testing and development purposes.
The server can be run in two modes: automatic simulation mode and manual mode. In automatic simulation mode, the server generates random data for the control system parameters. In manual mode, the server allows for manual input of data.
The server is designed to be easy to use and can be run locally or in a Docker container. It provides a simple API for subscribing to control system parameters and sending commands to the server.
The server is designed to be used for testing and development purposes only and should not be used in a production environment.

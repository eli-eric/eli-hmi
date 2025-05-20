# Websocket server

This websocket server is a simple `fastapi` application that provides a WebSocket API for testing and development purposes. It is designed to be used in conjunction with the ELI Beamlines Control System GUI project. It will connect directly to the EPICS layer using `aioca`

# How to use

1. Create virtual environment

```bash
python -m venv venv
```

2. Activate virtual environment

```bash
# Windows
venv\Scripts\activate
# Linux
source venv/bin/activate
```

3. Install dependencies

```bash
pip install -r requirements.txt
```

4. Run the server in dev mode

```bash
fastapi dev server.py
```

5. Run the server in prod mode

```bash
fastapi run server.py
```

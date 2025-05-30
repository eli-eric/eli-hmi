FROM harbor.eli-beams.eu/dockerhub/python:3.12.1

RUN mkdir -p /usr/app

WORKDIR /usr/app

COPY requirements.txt .

RUN pip install -r requirements.txt

COPY server.py ./
COPY websocket_pv_manager.py ./

ENTRYPOINT [ "fastapi", "run", "server.py", "--host", "0.0.0.0", "--port", "8080" ]
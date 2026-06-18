FROM harbor.eli-beams.eu/proxy-dockerhub/python:3.12.1

COPY pip.conf /etc

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

RUN mkdir -p /usr/app

WORKDIR /usr/app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./
COPY root_docs.md ./

USER appuser

ENTRYPOINT ["fastapi", "run", "server.py", "--host", "0.0.0.0", "--port", "8080"]
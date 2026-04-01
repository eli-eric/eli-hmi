PYTHON ?= python3
VENV_DIR ?= .venv
VENV_BIN := $(VENV_DIR)/bin
FASTAPI := $(VENV_BIN)/fastapi
PIP := $(VENV_BIN)/pip
IMAGE ?= eli-hmi-epics-gateway
HOST ?= 127.0.0.1
PORT ?= 8000

.PHONY: help venv install dev run docker-build docker-run clean

help:
	@printf "Targets:\n"
	@printf "  make install      Create/update virtualenv and install dependencies\n"
	@printf "  make dev          Run FastAPI in development mode\n"
	@printf "  make run          Run FastAPI in production mode\n"
	@printf "  make docker-build Build the container image\n"
	@printf "  make docker-run   Run the container locally\n"
	@printf "  make clean        Remove Python cache files\n"

venv:
	@test -x "$(VENV_BIN)/python" || $(PYTHON) -m venv "$(VENV_DIR)"

install: venv
	"$(PIP)" install --upgrade pip
	"$(PIP)" install -r requirements.txt

dev: install
	"$(FASTAPI)" dev server.py --host "$(HOST)" --port "$(PORT)"

run: install
	"$(FASTAPI)" run server.py --host "$(HOST)" --port "$(PORT)"

docker-build:
	docker build -t "$(IMAGE)" .

docker-run:
	docker run --rm -p "$(PORT):8080" "$(IMAGE)"

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete
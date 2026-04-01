build-image:
	docker build -f example-epics.Dockerfile -t epics-eli-hmi:latest .

run-image:
	docker run -it --network=host --rm epics-eli-hmi:latest
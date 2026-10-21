.DEFAULT_GOAL := help
.PHONY: help web-open web-serve web-dev up down logs

PORT ?= 21120
export PORT

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Web UI (local, serves on port $(PORT)):"
	@echo "  web-open    Ensure the web UI is running, starting it when down, then open it"
	@echo "  web-serve   Build and serve production (foreground). Override with PORT=21121."
	@echo "  web-dev     Run the dev server with hot reload (foreground)."
	@echo ""
	@echo "Docker (serves on port $(PORT)):"
	@echo "  up          Build and start the container (needs .env with GH_TOKEN)"
	@echo "  down        Stop the container (keeps the ghn-data volume)"
	@echo "  logs        Follow container logs"

# Ensure running, starting in the background when down, then open the browser.
# Thin wrapper: health check, start, wait, and open logic lives in
# scripts/ensure-web.sh. Raycast calls this target.
web-open:
	scripts/ensure-web.sh

# Serve production in the foreground.
web-serve:
	bun install
	bun run build
	bun --bun next start -p $(PORT)

# Run the dev server in the foreground.
web-dev:
	bun install
	bun --bun next dev -p $(PORT)

# Start the container in the background.
up:
	@if [ ! -f .env ]; then echo "Missing .env. Copy .env.example to .env and set GH_TOKEN first."; exit 1; fi
	docker compose up --build -d
	@echo "App: http://localhost:$(PORT)"

# Stop the container, keeping the ghn-data volume.
down:
	docker compose down

# Follow container logs (useful to tell app-down apart from auth errors).
logs:
	docker compose logs -f app

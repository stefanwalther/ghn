.DEFAULT_GOAL := help
.PHONY: help web-open web-serve web-dev

PORT ?= 21120
export PORT

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Web UI (local, serves on port $(PORT)):"
	@echo "  web-open    Ensure the web UI is running, starting it when down, then open it"
	@echo "  web-serve   Build and serve production (foreground). Override with PORT=21121."
	@echo "  web-dev     Run the dev server with hot reload (foreground)."

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

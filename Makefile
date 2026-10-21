.DEFAULT_GOAL := help
.PHONY: help web-open web-serve web-dev

# Per-workspace port (bg-style slot allocation). Explicit PORT=... in the
# environment wins; otherwise resolve a collision-free port for this checkout.
PORT ?= $(shell ./scripts/resolve-dev-runtime.sh --port-only 2>/dev/null || echo 21120)
export PORT

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Web UI (local, serves on port $(PORT)):"
	@echo "  web-open    Ensure the web UI is running, starting it when down, then open it"
	@echo "  web-serve   Build and serve production (foreground). Override with PORT=... ."
	@echo "  web-dev     Run the dev server with hot reload (foreground)."

# Ensure running, starting in the background when down, then open the browser.
# Thin wrapper: health check, start, wait, and open logic lives in
# scripts/ensure-web.sh. Raycast calls this target.
web-open:
	scripts/ensure-web.sh

# Serve production in the foreground (per-workspace port via resolve-dev-runtime.sh).
web-serve:
	bun install
	bun run build
	bun run start

# Run the dev server in the foreground (per-workspace port via resolve-dev-runtime.sh).
web-dev:
	bun install
	bun run dev

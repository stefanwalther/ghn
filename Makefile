.DEFAULT_GOAL := help

BUN ?= bun
# Per-workspace port (bg-style slot allocation via
# scripts/resolve-dev-runtime.sh, range 21120-21219, slot 0 reserved for
# non-worktree checkouts). Explicit PORT=... in the environment wins.
PORT ?= $(shell ./scripts/resolve-dev-runtime.sh --port-only 2>/dev/null || echo 21120)
export PORT

# Next.js emits .next/ (not $(BUILD_DIR)); clean removes both the canonical
# paths and the Next.js output. No executable ships from this repo (web app),
# so there is no link/unlink; install/uninstall provision the local app env.
VERSION_FILE := .release-please-manifest.json
PACKAGE_TAG := ghn
MANIFEST_VERSION := $(shell python3 -c 'import json; print(json.load(open("$(VERSION_FILE)"))["."])' 2>/dev/null)
SOURCE_REVISION := $(shell git rev-parse --short=12 HEAD 2>/dev/null)
SOURCE_DIRTY := $(shell test -z "$$(git status --porcelain --untracked-files=normal 2>/dev/null)" || printf '.dirty')
AT_RELEASE_TAG := $(shell test -n '$(MANIFEST_VERSION)' && test -z '$(SOURCE_DIRTY)' && git describe --exact-match --tags --match '$(PACKAGE_TAG)-v$(MANIFEST_VERSION)' >/dev/null 2>&1 && printf yes)
SOURCE_VERSION := $(if $(AT_RELEASE_TAG),$(MANIFEST_VERSION),$(if $(and $(MANIFEST_VERSION),$(SOURCE_REVISION)),$(MANIFEST_VERSION)+g$(SOURCE_REVISION)$(SOURCE_DIRTY)))
VERSION ?= $(SOURCE_VERSION)

.PHONY: help version build check test test-e2e test-help test-build-version dev web-open web-serve web-dev install uninstall clean fmt-fix fmt-check fmt lint-check lint-fix lint up down logs

help: ## Show available Make targets.
	@awk 'BEGIN {FS = ":.*## "; print "Available targets:"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-28s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

version: ## Print the computed release version (manifest + git SHA + .dirty).
	@test -n '$(VERSION)' || { printf 'Cannot determine source version; restore %s and Git metadata or pass VERSION explicitly\n' '$(VERSION_FILE)' >&2; exit 1; }
	@printf '%s\n' '$(VERSION)'

build: install ## Install deps and build the production Next.js bundle (.next/).
	$(BUN) run build

check: fmt-check lint-check test test-help test-build-version ## Run the local verification gate (test-e2e stays out).

test: ## Run the unit suite only (bun test tests/unit). No lint, no build, no infra.
	$(BUN) test tests/unit

test-e2e: ## Run Playwright end-to-end tests (starts its own server; needs Playwright browsers; stays out of every gate).
	$(BUN) x playwright test

test-help: ## Verify make and make help show project target help.
	@output="$$( $(MAKE) --no-print-directory )"; \
	echo "$$output" | grep -q '^Available targets:'; \
	echo "$$output" | grep -q 'build'; \
	echo "$$output" | grep -q 'dev'; \
	echo "$$output" | grep -q 'check'; \
	output="$$( $(MAKE) --no-print-directory help )"; \
	echo "$$output" | grep -q '^Available targets:'; \
	echo "$$output" | grep -q 'test-e2e'

test-build-version: ## Verify version computation (manifest + git SHA + .dirty, VERSION override).
	@set -e; \
	tmp="$$(mktemp -d)"; \
	trap 'rm -rf "$$tmp"' EXIT; \
	manifest_version="$$(python3 -c 'import json; print(json.load(open("$(VERSION_FILE)"))["."])')"; \
	revision="$$(git rev-parse --short=12 HEAD)"; \
	dirty=""; test -z "$$(git status --porcelain --untracked-files=normal)" || dirty=".dirty"; \
	expected="$$manifest_version+g$$revision$$dirty"; \
	if test -z "$$dirty" && git describe --exact-match --tags --match "$(PACKAGE_TAG)-v$$manifest_version" >/dev/null 2>&1; then expected="$$manifest_version"; fi; \
	test "$$($(MAKE) --no-print-directory version)" = "$$expected"; \
	test "$$($(MAKE) --no-print-directory version VERSION="9.8.7")" = "9.8.7"; \
	! $(MAKE) --no-print-directory version VERSION_FILE="$$tmp/absent.json" >/dev/null 2>&1

dev: install ## Run the dev server with hot reload in the foreground (per-workspace port via resolve-dev-runtime.sh; explicit PORT wins).
	$(BUN) run dev

web-open: ## Ensure the web UI is running, starting it when down, then open it.
	scripts/ensure-web.sh

web-serve: build ## Build and serve production in the foreground (per-workspace port via resolve-dev-runtime.sh; explicit PORT wins).
	$(BUN) run start

web-dev: dev ## Deprecated alias for dev (foreground dev server).

up: ## Build and start the container in the background (needs .env with GH_TOKEN).
	@if [ ! -f .env ]; then echo "Missing .env. Copy .env.example to .env and set GH_TOKEN first."; exit 1; fi
	docker compose up --build -d
	@echo "App: http://localhost:$(PORT)"

down: ## Stop the container (keeps the ghn-data volume).
	docker compose down

logs: ## Follow container logs (useful to tell app-down apart from auth errors).
	docker compose logs -f app

install: ## Install dependencies (bun install); idempotent, repairs a clean checkout in place.
	$(BUN) install

uninstall: ## Remove local install artifacts (node_modules, .next, build, dist); preserves user data (database).
	rm -rf node_modules .next build dist coverage
	@echo "Removed local install artifacts; user data (database) preserved."

clean: ## Remove generated artifacts (build, dist, .next).
	rm -rf build dist .next

fmt-fix: ## No code formatter configured yet; no-op until one is adopted. Formatting is manual.
	@echo "fmt-fix: no code formatter configured; nothing to do."

fmt-check: ## No code formatter configured yet; no-op until one is adopted (prettier/biome candidate).
	@echo "fmt-check: no code formatter configured; nothing to verify."

fmt: fmt-fix ## Deprecated alias for fmt-fix.

lint-check: ## Run static analysis: tsc --noEmit plus eslint on app lib db components tests.
	$(BUN) run typecheck
	$(BUN) x eslint app lib db components tests

lint-fix: ## Autofix with eslint --fix on app lib db components tests; reports the rest. Never called from CI gates.
	$(BUN) x eslint --fix app lib db components tests

lint: lint-check ## Deprecated alias for lint-check.

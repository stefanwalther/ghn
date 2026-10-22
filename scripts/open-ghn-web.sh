#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Open GHN Web
# @raycast.mode silent
# @raycast.packageName GHN
# @raycast.icon 🔔
# @raycast.description Open the local GHN web UI, starting the server when down
#
# Thin launcher (usable as a Raycast Script Command): all ensure-running,
# start, and open logic lives in scripts/ensure-web.sh. Point the Raycast
# Script Commands extension at the scripts folder to pick it up.
#
# - App already running -> just opens it.
# - App not running     -> installs deps when stale, starts the server in
#                          the background, waits until it answers, then opens it.

set -u

# Raycast does not load the login shell profile, so Homebrew and bun
# binaries can be missing from PATH. Append (never prepend) the usual
# locations so anything already on PATH keeps precedence.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin"

exec "$(cd "$(dirname "$0")" && pwd)/ensure-web.sh" "$@"

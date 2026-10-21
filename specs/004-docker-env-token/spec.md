# Feature Specification: Docker Env Token Support

**Feature Branch**: `004-docker-env-token`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Support running the app from a Docker container using a GitHub token passed as an env variable in compose config (as an additional auth option alongside the existing gh CLI session), with Makefile up/down targets and README documentation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run app in container with env token (Priority: P1)

A developer with a GitHub token starts the app in a container without relying on a host `gh` login and uses the inbox normally.

**Why this priority**: This is the core test from the discussion. Without it the container cannot authenticate to GitHub.

**Independent Test**: Set a token in the local env file, run the up command, open the app URL, and confirm the connection status shows connected and notifications load.

**Acceptance Scenarios**:

1. **Given** a valid token is configured in the env file, **When** the user runs the up command and opens the app, **Then** the app shows a connected GitHub state and loads live data.
2. **Given** no token and no host auth is available to the container, **When** the user runs the up command and opens the app, **Then** the app shows a distinct disconnected state with a reconnect hint and cached data stays readable.

---

### User Story 2 - Keep local gh flow unchanged (Priority: P1)

A developer running the app locally without Docker keeps using the existing host login with no extra setup.

**Why this priority**: The env token must be an additional option, not a replacement, or local use regresses.

**Independent Test**: Run the app locally as today with an authenticated host session and confirm sync and contributions work with no env token set.

**Acceptance Scenarios**:

1. **Given** the app runs outside a container with an authenticated host session and no token env var, **When** the user syncs, **Then** sync succeeds as before.
2. **Given** both a host session and a token env var are present, **When** the user syncs, **Then** the result matches either credential for the same account and no duplicate login step is required.

---

### User Story 3 - Start and stop with Makefile (Priority: P2)

A developer starts and stops the containerized app with short Makefile commands.

**Why this priority**: `up` and `down` are the requested interface. They make the container test repeatable.

**Independent Test**: Run the up target then the down target from a clean checkout and confirm the app serves then stops, with data preserved across restarts.

**Acceptance Scenarios**:

1. **Given** a clean checkout with env file configured, **When** the user runs the up target, **Then** the app becomes reachable on the documented port without manual container commands.
2. **Given** the containerized app is running, **When** the user runs the down target, **Then** containers stop and a subsequent up run retains previously synced app data.

---

### User Story 4 - Follow README to configure (Priority: P2)

A new developer configures token, port, and data persistence from the README alone.

**Why this priority**: Documentation is explicitly requested and is how the option gets discovered safely.

**Independent Test**: Follow only the README Docker section on a fresh machine with Docker available and reach a running connected app or a clear auth error.

**Acceptance Scenarios**:

1. **Given** the README Docker section, **When** the user follows it step by step, **Then** they can configure the token without committing it and know where data is stored.
2. **Given** an invalid or missing token, **When** the user follows the README troubleshooting steps, **Then** they can distinguish an auth problem from the app being down.

---

### Edge Cases

- What happens when the token is expired or revoked mid-session?
- How does the app behave when the token has insufficient scopes for notifications or contributions?
- What happens when both the env token and a mounted host credential exist but belong to different accounts?
- How does the setup handle a custom port override conflicting with an already used port?
- What happens when the data volume is missing or not writable on first start?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support GitHub authentication via a token supplied as an environment variable as an additional option alongside the existing host session method.
- **FR-002**: System MUST prefer the environment-supplied token when present and fall back to the existing host session when absent, with no extra user step.
- **FR-003**: System MUST show a distinct disconnected state with a reconnect hint when neither auth method yields a usable credential.
- **FR-004**: System MUST provide containerized startup via a compose configuration that passes the token at runtime without baking it into the image.
- **FR-005**: System MUST provide Makefile `up` and `down` targets to start and stop the containerized app.
- **FR-006**: System MUST persist app data across container restarts via a mounted volume or named volume.
- **FR-007**: System MUST document the container workflow in the README including token setup, start and stop commands, port, data location, and troubleshooting for auth versus app-down cases.
- **FR-008**: System MUST never require committing the token to the repository and MUST provide an ignored env file plus a committed example.
- **FR-009**: System MUST keep all existing local behaviors working when the token variable is unset.

### Key Entities

- **GitHub credential**: The token or host session used to access GitHub on behalf of the single user. Attribute: source method (env vs host).
- **Containerized app**: The running app instance started via compose. Attributes: service port, data volume, auth source in effect.
- **Env configuration**: The local ignored file holding the token and overrides. Attributes: token value presence, port override, host and API base overrides.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with a valid token can go from clean checkout to a connected containerized app in under 10 minutes following only the README.
- **SC-002**: Starting the containerized app with a missing or invalid token produces a disconnected indication within 30 seconds instead of a blank or hanging page.
- **SC-003**: 100% of existing local flows pass without an env token set, confirming no regression to the default method.
- **SC-004**: Restarting via down then up retains previously synced inbox state without a full resync.

## Assumptions

- Single-user local or single-container use only. Multi-user token management is out of scope.
- Standard GitHub token with notification and repo read scopes is sufficient. Token creation steps link to standard GitHub docs.
- Docker and compose are already installed on the test machine.
- Default app port remains 21120 with an env override for conflicts.
- Compose file uses the modern `compose.yaml` name unless the repo convention dictates otherwise.
- Example env file is committed while the real env file stays ignored and is never logged.

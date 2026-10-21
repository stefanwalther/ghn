# Contract: GitHub Stand-In

**Feature**: [004-test-suite](../spec.md) | **Date**: 2026-10-20

The local substitute for the GitHub API. It is the only thing the test suite is ever allowed to talk to.

---

## 1. Guarantees

1. The stand-in **never** forwards a request to the real GitHub service. It has no upstream at all.
2. The stand-in is the **only** thing the application talks to during the suite. The application reaches it through `GHN_API_BASE`.
3. The stand-in **rejects** a request that does not carry the expected credential, so the authorization-failure path is reachable without a real account.
4. The stand-in is **deterministic**. The same dataset and the same scenario set produce the same responses on every run.
5. The stand-in is used **unchanged** by the integration layer (in-process) and the end-to-end layer (a separate process). One behaviour, two layers.

---

## 2. HTTP contract

### 2.1 Endpoints

Every endpoint the application calls. The path column is relative to `GHN_API_BASE`.

| Method | Path | Response | Used by |
|---|---|---|---|
| GET | `/user` | `{ "login": "test-user" }` | `probeConnection`, the core rate-limit probe |
| GET | `/notifications` | Thread array. Headers: `last-modified`, `x-poll-interval`, and `link` with `rel="next"` when more pages exist | `listNotifications` |
| GET | `/notifications/threads/{id}` | One thread object | `fetchThread` |
| PATCH | `/notifications/threads/{id}` | 200, 204 or 205, empty body | `markThreadRead` |
| DELETE | `/notifications/threads/{id}` | 200, 204 or 205, empty body | `markThreadDone` |
| PUT | `/notifications/threads/{id}/subscription` | 200, `{ "ignored": true }` | `setSubscriptionIgnored` |
| GET | `/repos/{owner}/{repo}` | 200 with the repository, or 404 | `checkRepoExists` |
| GET | `/repos/{owner}/{repo}/pulls/{n}` | Subject payload | `fetchSubjectContent`, `resolveSubjectHtmlUrl` |
| GET | `/repos/{owner}/{repo}/issues/{n}` | Subject payload | `fetchSubjectContent` |
| GET | `/repos/{owner}/{repo}/issues/{n}/comments` | `[{ "user": { "login" }, "body", "created_at" }]` | `fetchThreadComments` |
| GET | `/repos/{owner}/{repo}/actions/runs` | `{ "workflow_runs": [...] }` | `fetchWorkflowRuns` |
| GET | `/repos/{owner}/{repo}/commits/{sha}/status` | `{ "statuses": [{ "state" }] }` | `fetchCheckSummary` |
| GET | `/repos/{owner}/{repo}/commits/{sha}/check-runs` | `{ "check_runs": [{ "status", "conclusion" }] }` | `fetchCheckSummary` |
| GET | `/search/repositories` | 200 with any JSON body | the search rate-limit probe |
| POST | `/graphql` | `{ "data": { "viewer": { "login" } } }`, or the contributions calendar | the GraphQL rate-limit probe, contributions |

### 2.2 Subject payload

```json
{
  "title": "Fix flaky login redirect",
  "body": "The redirect races the session load.",
  "state": "open",
  "draft": false,
  "merged": false,
  "user": { "login": "test-user" },
  "html_url": "https://github.com/acme/web/pull/1",
  "head": { "sha": "0123456789abcdef0123456789abcdef01234567" }
}
```

The payload is **per item**. The application records the `merged` and `state` values from this response into the database, so a single default payload would silently rewrite those fields for every row.

### 2.3 Thread object

```json
{
  "id": "n_001",
  "unread": true,
  "reason": "mention",
  "updated_at": "2026-01-15T11:00:00Z",
  "subject": {
    "title": "Fix flaky login redirect",
    "type": "PullRequest",
    "url": "http://127.0.0.1:21141/repos/acme/web/pulls/1"
  },
  "repository": {
    "full_name": "acme/web",
    "html_url": "https://github.com/acme/web",
    "owner": { "login": "acme" }
  },
  "url": "http://127.0.0.1:21141/notifications/threads/n_001"
}
```

The `subject.url` and `url` values MUST point at the stand-in's own base URL, because the application fetches them verbatim.

### 2.4 Rate-limit headers

Every response carries:

```text
x-ratelimit-limit: 5000
x-ratelimit-used: 1234
x-ratelimit-remaining: 3766
x-ratelimit-reset: <unix seconds>
```

The application reads nothing else when it computes the rate-limit view.

### 2.5 Pagination

The `link` header follows RFC 5988. Its URL MUST include the stand-in's port, built from the request's `Host` header. Reconstructing the origin without the port sends the follow-up request to port 80, where it fails as a network error rather than as a test assertion.

```text
link: <http://127.0.0.1:21141/notifications?all=true&per_page=50&page=2>; rel="next"
```

### 2.6 Health

```text
GET /health -> 200, {"ok": true}
```

Used by the end-to-end runner to know the stand-in is ready before the application starts.

---

## 3. Scripting contract

### 3.1 Scenarios

A scenario overrides the response for a path. It is how the failure paths are exercised deliberately rather than by accident (FR-008).

```ts
interface Scenario {
  status: number;
  body?: unknown;
  delayMs?: number;
  rateLimitRemaining?: number;
}
```

| Scenario | Status | Extra | The application's reading |
|---|---|---|---|
| Success | 200 | body | The happy path |
| Unauthorized | 401 | | `classifyStatus` returns `auth` |
| Rate limited | 403 | `rateLimitRemaining: 0` | `classifyStatus` returns `rate_limited` |
| Forbidden | 403 | `rateLimitRemaining: 1` | `classifyStatus` returns `auth` |
| Not found | 404 | | The subject is gone |
| Server error | 500 | | `classifyStatus` returns `unknown` |
| Timeout | 200 | `delayMs` above the client's abort timeout | The client's abort path |

Scenarios are matched on path. A scenario with no path matches every path.

### 3.2 Controller

```ts
interface StandIn {
  url: string;
  requests: Array<{ method: string; path: string; authorization?: string; body?: string }>;

  setThreads(threads: Thread[]): void;
  setSubject(path: string, payload: unknown): void;
  setScenario(path: string, scenario: Scenario | null): void;
  setRateLimit(limit: number, used: number, remaining: number, reset: number): void;
  reset(): void;
  close(): Promise<void>;
}
```

| Method | Contract |
|---|---|
| `setThreads` | Replaces the served thread list. The next `GET /notifications` returns it. |
| `setSubject` | Sets the payload for one subject path. Without it, the merged and state fields would be wrong for that row. |
| `setScenario` | Sets or clears the scenario for a path. `null` restores the default response. |
| `setRateLimit` | Changes the rate-limit headers on subsequent responses. |
| `reset` | Clears the scenarios, restores the default dataset and the default rate-limit headers, and empties the request log. |
| `close` | Stops listening and releases the port. |

`requests` records every request the stand-in received, so a test can assert that the application made the calls it should have, and no others.

---

## 4. Invocation contract

### 4.1 In-process, from the integration layer

```ts
const standIn = await startGitHubStandIn({ token: "test-token", threads });
// ...exercise the application...
await standIn.close();
```

The port is chosen by the operating system unless one is given, so parallel test files do not collide.

### 4.2 As a separate process, for the end-to-end layer

```text
STANDIN_PORT=21141 bun run tests/support/stand-in-server.ts
```

The standalone entry point starts the same module, sets the threads from the shared dataset, and prints the base URL. The end-to-end runner waits for `GET /health` before starting the application.

---

## 5. Relationship to the application's configuration

| Application setting | Value during the suite | Effect |
|---|---|---|
| `GHN_API_BASE` | the stand-in's base URL | Every GitHub request goes to the stand-in |
| `GHN_TOKEN` | the stand-in's credential | The credential is presented to the stand-in, and the stand-in rejects a mismatch |
| `GHN_TOKEN` (empty) | no credential | The application reports "not connected" and every remote path degrades gracefully |

Both values are exercised. The credential path proves the application calls the API correctly; the empty path proves it degrades without one.

---

## 6. Change impact

| Change | Breaking for |
|---|---|
| A new endpoint in the application | The stand-in must serve it, or the feature that calls it is untestable |
| A change to a response shape the application parses | The stand-in's payload |
| A change to how the application derives a URL | `subjectApiUrlFromHtml` and `subjectCommentsUrlFromHtml` currently hardcode `https://api.github.com` and must be made base-aware |
| A change to `classifyStatus` | The scenario table |

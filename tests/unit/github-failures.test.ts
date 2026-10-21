import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  checkRepoExists,
  classifyStatus,
  fetchCheckSummary,
  fetchSubjectContent,
  fetchThread,
  fetchThreadComments,
  fetchWorkflowRuns,
  getStoredToken,
  listNotifications,
  markThreadDone,
  markThreadRead,
  probeConnection,
  resolveSubjectHtmlUrl,
  setSubscriptionIgnored,
  type GhThread,
} from "@/lib/github";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

const ENV_KEYS = ["GHN_TOKEN", "GHN_API_BASE"] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

/**
 * Replaces the global fetch with a recorder, so a check can assert on the
 * request the application made without opening a socket.
 */
function stubFetch(
  responder: (call: Recorded) => Response | Promise<Response>
): Recorded[] {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: unknown, init?: { method?: string; headers?: unknown; body?: unknown }) => {
      const headers: Record<string, string> = {};
      const raw = init?.headers;
      if (raw && typeof raw === "object") {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          headers[key] = String(value);
        }
      }
      const call: Recorded = {
        url: String(input),
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : null,
      };
      calls.push(call);
      return responder(call);
    }
  );
  return calls;
}

function json(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

function thread(overrides: Partial<GhThread> = {}): GhThread {
  return {
    id: "9001",
    unread: true,
    reason: "subscribed",
    updatedAt: 1792000000000,
    subjectTitle: "Fix flaky login redirect",
    subjectType: "PullRequest",
    subjectApiUrl: "https://api.github.com/repos/acme/web/pulls/12",
    repoFullName: "acme/web",
    repoOwnerLogin: "acme",
    repoHtmlUrl: "https://github.com/acme/web",
    threadUrl: "https://api.github.com/notifications/threads/9001",
    ...overrides,
  };
}

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.GHN_API_BASE = "https://api.example.test";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe("classifyStatus", () => {
  // A rejected credential is an authorization problem.
  test("401 is an authorization failure", () => {
    expect(classifyStatus(401)).toBe("auth");
  });

  // A 403 with an exhausted limit is a rate limit, not an authorization
  // problem.
  test("403 with no remaining quota is a rate limit", () => {
    const res = new Response("{}", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    });
    expect(classifyStatus(403, res)).toBe("rate_limited");
  });

  // A 403 with quota left is an authorization problem.
  test("403 with quota left is an authorization failure", () => {
    const res = new Response("{}", {
      status: 403,
      headers: { "x-ratelimit-remaining": "42" },
    });
    expect(classifyStatus(403, res)).toBe("auth");
  });

  // A 403 without the rate-limit headers is an authorization problem too.
  test("403 without the rate-limit headers is an authorization failure", () => {
    expect(classifyStatus(403)).toBe("auth");
  });

  // A 429 is always a rate limit.
  test("429 is a rate limit", () => {
    expect(classifyStatus(429)).toBe("rate_limited");
  });

  // Anything else is unknown.
  test("every other status is unknown", () => {
    expect(classifyStatus(500)).toBe("unknown");
    expect(classifyStatus(404)).toBe("unknown");
  });
});

describe("the stored token", () => {
  // The configured token is the credential, trimmed.
  test("the configured token is used as it is", async () => {
    process.env.GHN_TOKEN = "  secret-token  ";
    await expect(getStoredToken()).resolves.toBe("secret-token");
  });

  // An explicitly empty token means no credential, and it never falls back
  // to the local helper.
  test("an explicitly empty token means no credential", async () => {
    process.env.GHN_TOKEN = "";
    await expect(getStoredToken()).resolves.toBeNull();
  });

  // Without a configured token the local helper is asked, and under the
  // test runtime there is none.
  test("without a configured token there is no credential", async () => {
    delete process.env.GHN_TOKEN;
    await expect(getStoredToken()).resolves.toBeNull();
  });
});

describe("probeConnection", () => {
  // Without a credential the connection is not established.
  test("without a token the connection is refused", async () => {
    process.env.GHN_TOKEN = "";
    await expect(probeConnection()).resolves.toEqual({
      connected: false,
      viewerLogin: null,
      reason: "auth",
    });
  });

  // A working credential and a working endpoint establish the connection
  // and report the viewer.
  test("a working credential establishes the connection", async () => {
    process.env.GHN_TOKEN = "secret-token";
    const calls = stubFetch(() => json({ login: "octo" }));

    await expect(probeConnection()).resolves.toEqual({
      connected: true,
      viewerLogin: "octo",
    });
    expect(calls[0]?.url).toBe("https://api.example.test/user");
    expect(calls[0]?.headers.Authorization).toBe("Bearer secret-token");
  });

  // A rejected credential is reported as an authorization failure.
  test("a rejected credential is an authorization failure", async () => {
    process.env.GHN_TOKEN = "secret-token";
    stubFetch(() => new Response("{}", { status: 401 }));
    await expect(probeConnection()).resolves.toEqual({
      connected: false,
      viewerLogin: null,
      reason: "auth",
    });
  });

  // An unreachable endpoint is reported as a network failure.
  test("an unreachable endpoint is a network failure", async () => {
    process.env.GHN_TOKEN = "secret-token";
    stubFetch(() => {
      throw new Error("connection refused");
    });
    await expect(probeConnection()).resolves.toEqual({
      connected: false,
      viewerLogin: null,
      reason: "network",
    });
  });

  // A working endpoint without a login is connected, but the account is
  // unknown.
  test("a payload without a login is connected to an unknown account", async () => {
    process.env.GHN_TOKEN = "secret-token";
    stubFetch(() => json({ id: 1 }));
    await expect(probeConnection()).resolves.toEqual({
      connected: true,
      viewerLogin: null,
    });
  });
});

describe("listNotifications", () => {
  // A rejected request reports the status and the reason.
  test("a rejected request reports the status", async () => {
    stubFetch(() => new Response("{}", { status: 401 }));
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("auth");
    expect(result.status).toBe(401);
  });

  // An unreachable endpoint is a network failure.
  test("an unreachable endpoint is a network failure", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
  });

  // A page that is not an array of threads yields no threads rather than a
  // crash.
  test("a page that is not a list of threads yields no threads", async () => {
    stubFetch(() => json({ message: "not a list" }));
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.threads).toEqual([]);
  });

  // A thread without an identifier, without a subject or without a
  // timestamp cannot be stored, so it is dropped.
  test("a thread without the required fields is dropped", async () => {
    stubFetch(() =>
      json([
        { id: { bad: true }, updated_at: "2026-10-16T10:00:00Z" },
        { id: "1", updated_at: "2026-10-16T10:00:00Z" },
        { id: "2", updated_at: "not a date" },
        {
          id: "3",
          updated_at: "2026-10-16T10:00:00Z",
          subject: { title: "T", type: "Issue", url: "u" },
          repository: { full_name: "a/b", html_url: "h", owner: { login: "a" } },
        },
      ])
    );
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.threads.map((t) => t.id)).toEqual(["3"]);
  });
});

describe("fetchThread", () => {
  // A payload that is not a thread is reported as unknown, because the
  // request itself succeeded.
  test("a payload that is not a thread is unknown", async () => {
    stubFetch(() => json({ message: "not a thread" }));
    const result = await fetchThread("token", "9001");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unknown");
    expect(result.status).toBe(200);
  });

  // An unreachable endpoint is a network failure.
  test("an unreachable endpoint is a network failure", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    const result = await fetchThread("token", "9001");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
  });
});

describe("the write-back calls", () => {
  // A read that cannot reach GitHub is a network failure.
  test("a read that cannot reach GitHub is a network failure", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    const result = await markThreadRead("token", "9001");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
  });

  // A done that cannot reach GitHub is a network failure.
  test("a done that cannot reach GitHub is a network failure", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    const result = await markThreadDone("token", "9001");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
  });

  // A rejected unsubscription reports the status.
  test("a rejected unsubscription reports the status", async () => {
    const calls = stubFetch(() => new Response("{}", { status: 403 }));
    const result = await setSubscriptionIgnored("token", "9001", true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("auth");
    expect(result.status).toBe(403);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(
      "https://api.example.test/notifications/threads/9001/subscription"
    );
    expect(calls[0]?.body).toBe('{"ignored":true}');
  });

  // An unsubscription that cannot reach GitHub is a network failure.
  test("an unsubscription that cannot reach GitHub is a network failure", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    const result = await setSubscriptionIgnored("token", "9001", false);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
  });
});

describe("checkRepoExists", () => {
  // A missing repository is reported as missing.
  test("a 404 means the repository does not exist", async () => {
    stubFetch(() => new Response("{}", { status: 404 }));
    await expect(checkRepoExists("token", "acme/web")).resolves.toBe(false);
  });

  // A repository that answers exists.
  test("a repository that answers exists", async () => {
    stubFetch(() => new Response("{}", { status: 200 }));
    await expect(checkRepoExists("token", "acme/web")).resolves.toBe(true);
  });

  // A failing request cannot tell, so the answer is unknown.
  test("a failing request cannot tell", async () => {
    stubFetch(() => new Response("{}", { status: 500 }));
    await expect(checkRepoExists("token", "acme/web")).resolves.toBeNull();
  });

  // An unreachable endpoint cannot tell either.
  test("an unreachable endpoint cannot tell", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    await expect(checkRepoExists("token", "acme/web")).resolves.toBeNull();
  });
});

describe("fetchSubjectContent", () => {
  // A rejected request has no subject.
  test("a rejected request has no subject", async () => {
    stubFetch(() => new Response("{}", { status: 404 }));
    await expect(
      fetchSubjectContent("token", "https://api.example.test/repos/acme/web/pulls/12")
    ).resolves.toBeNull();
  });

  // An unreachable endpoint has no subject.
  test("an unreachable endpoint has no subject", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    await expect(
      fetchSubjectContent("token", "https://api.example.test/repos/acme/web/pulls/12")
    ).resolves.toBeNull();
  });
});

describe("fetchThreadComments", () => {
  // A rejected request has no comments.
  test("a rejected request has no comments", async () => {
    stubFetch(() => new Response("{}", { status: 404 }));
    await expect(
      fetchThreadComments("token", "https://api.example.test/repos/acme/web/issues/12/comments")
    ).resolves.toEqual([]);
  });

  // A payload that is not a list has no comments.
  test("a payload that is not a list has no comments", async () => {
    stubFetch(() => json({ message: "not a list" }));
    await expect(
      fetchThreadComments("token", "https://api.example.test/repos/acme/web/issues/12/comments")
    ).resolves.toEqual([]);
  });

  // An unreachable endpoint has no comments.
  test("an unreachable endpoint has no comments", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    await expect(
      fetchThreadComments("token", "https://api.example.test/repos/acme/web/issues/12/comments")
    ).resolves.toEqual([]);
  });
});

describe("fetchWorkflowRuns", () => {
  // A rejected request has no runs.
  test("a rejected request has no runs", async () => {
    stubFetch(() => new Response("{}", { status: 404 }));
    await expect(
      fetchWorkflowRuns("token", { owner: "acme", repo: "web", branch: null })
    ).resolves.toEqual([]);
  });

  // A payload without the runs list has no runs.
  test("a payload without the runs list has no runs", async () => {
    stubFetch(() => json({ total_count: 0 }));
    await expect(
      fetchWorkflowRuns("token", { owner: "acme", repo: "web", branch: null })
    ).resolves.toEqual([]);
  });

  // A run without a name, a url, a status or a timestamp cannot be shown,
  // so it is dropped.
  test("a run without the required fields is dropped", async () => {
    stubFetch(() =>
      json({
        workflow_runs: [
          { name: "CI", html_url: "https://example.com/1", status: "completed" },
          { html_url: "https://example.com/2", status: "completed", created_at: "2026-10-17T10:00:00Z" },
          { name: "Lint", status: "completed", created_at: "2026-10-17T10:00:00Z" },
          { name: "Docs", html_url: "https://example.com/4", created_at: "2026-10-17T10:00:00Z" },
          {
            name: "Release",
            html_url: "https://example.com/5",
            status: "completed",
            created_at: "2026-10-17T10:00:00Z",
          },
        ],
      })
    );
    const runs = await fetchWorkflowRuns("token", {
      owner: "acme",
      repo: "web",
      branch: null,
    });
    expect(runs.map((r) => r.name)).toEqual(["Release"]);
  });

  // An unreachable endpoint has no runs.
  test("an unreachable endpoint has no runs", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    await expect(
      fetchWorkflowRuns("token", { owner: "acme", repo: "web", branch: null })
    ).resolves.toEqual([]);
  });
});

describe("fetchCheckSummary", () => {
  // When neither the statuses nor the check runs can be read, the summary
  // is unknown rather than empty.
  test("an unreachable endpoint has no summary", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    await expect(
      fetchCheckSummary("token", { owner: "acme", repo: "web", sha: "abc123" })
    ).resolves.toBeNull();
  });

  // A check run that has not finished yet is pending, not a failure.
  test("a check run that has not finished is pending", async () => {
    stubFetch((call) => {
      if (call.url.includes("/check-runs")) {
        return json({
          check_runs: [
            { status: "in_progress", conclusion: null },
            { status: "completed", conclusion: "success" },
          ],
        });
      }
      return json({ statuses: [] });
    });
    await expect(
      fetchCheckSummary("token", { owner: "acme", repo: "web", sha: "abc123" })
    ).resolves.toEqual({ state: "pending", passing: 1, total: 2 });
  });
});

describe("resolveSubjectHtmlUrl", () => {
  // A thread without a subject api url falls back to the repository's own
  // page.
  test("a thread without a subject api url falls back to the repository page", async () => {
    const url = await resolveSubjectHtmlUrl(
      "token",
      thread({ subjectApiUrl: "" }),
      new Map()
    );
    expect(url).toBe("https://github.com/acme/web");
  });

  // A repository without a page of its own falls back to the repository
  // name.
  test("a repository without a page falls back to its name", async () => {
    const url = await resolveSubjectHtmlUrl(
      "token",
      thread({ subjectApiUrl: "", repoHtmlUrl: "", repoFullName: "acme/web" }),
      new Map()
    );
    expect(url).toBe("https://github.com/acme/web");
  });

  // A subject api url that does not point at a pull request or an issue
  // falls back to the repository's own page.
  test("a subject api url without a number falls back to the repository page", async () => {
    const url = await resolveSubjectHtmlUrl(
      "token",
      thread({ subjectApiUrl: "https://api.github.com/repos/acme/web" }),
      new Map()
    );
    expect(url).toBe("https://github.com/acme/web");
  });

  // A rejected subject request falls back to the pull request's own page,
  // which the subject api url already identifies.
  test("a rejected subject request falls back to the pull request page", async () => {
    stubFetch(() => new Response("{}", { status: 404 }));
    const cache = new Map<string, string>();
    const url = await resolveSubjectHtmlUrl("token", thread(), cache);
    expect(url).toBe("https://github.com/acme/web/pull/12");
    expect(cache.get("https://api.github.com/repos/acme/web/pulls/12")).toBe(
      "https://github.com/acme/web/pull/12"
    );
  });

  // An unreachable endpoint falls back the same way.
  test("an unreachable endpoint falls back to the pull request page", async () => {
    stubFetch(() => {
      throw new Error("connection refused");
    });
    const url = await resolveSubjectHtmlUrl("token", thread(), new Map());
    expect(url).toBe("https://github.com/acme/web/pull/12");
  });

  // The resolved url is remembered, so the subject is only looked up once.
  test("the resolved url is remembered", async () => {
    const calls = stubFetch(() => json({ html_url: "https://github.com/acme/web/pull/12" }));
    const cache = new Map<string, string>();
    const first = await resolveSubjectHtmlUrl("token", thread(), cache);
    const second = await resolveSubjectHtmlUrl("token", thread(), cache);
    expect(first).toBe("https://github.com/acme/web/pull/12");
    expect(second).toBe("https://github.com/acme/web/pull/12");
    expect(calls).toHaveLength(1);
  });

  // The merged flag and the state of the subject are recorded for the
  // filters that need them.
  test("the merged flag and the state are recorded", async () => {
    stubFetch(() =>
      json({ html_url: "https://github.com/acme/web/pull/12", merged: true, state: "closed" })
    );
    const github = await import("@/lib/github");
    await resolveSubjectHtmlUrl("token", thread(), new Map());
    expect(github.readPrMerged("https://api.github.com/repos/acme/web/pulls/12")).toBe(true);
    expect(github.readSubjectState("https://api.github.com/repos/acme/web/pulls/12")).toBe(
      "closed"
    );
  });
});

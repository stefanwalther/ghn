import { describe, expect, test } from "vitest";
import { classifyStatus } from "@/lib/github";
import {
  startGitHubStandIn,
  type StandIn,
  type StandInOptions,
  type StandInThread,
} from "../support/github-stand-in";

/**
 * The stand-in's own contract.
 *
 * The stand-in is the only GitHub the suite is allowed to talk to, so its
 * behaviour has to be pinned down here. Every other integration check leans
 * on it, and a drift in the stand-in would silently change what the
 * application-level checks mean.
 */

const TOKEN = "test-token";

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${TOKEN}` };
}

function makeThread(overrides: Partial<StandInThread> = {}): StandInThread {
  return {
    id: "t_001",
    unread: true,
    reason: "mention",
    updated_at: "2026-01-15T11:00:00Z",
    subject: {
      title: "Fix flaky login redirect",
      type: "PullRequest",
      url: "http://127.0.0.1/repos/acme/web/pulls/1",
    },
    repository: {
      full_name: "acme/web",
      html_url: "https://github.com/acme/web",
      owner: { login: "acme" },
    },
    url: "http://127.0.0.1/notifications/threads/t_001",
    ...overrides,
  };
}

/** Runs a check against a fresh stand-in and always releases the port. */
async function withStandIn<T>(
  fn: (standIn: StandIn) => Promise<T>,
  options: StandInOptions = {}
): Promise<T> {
  const standIn = await startGitHubStandIn({ token: TOKEN, ...options });
  try {
    return await fn(standIn);
  } finally {
    await standIn.close();
  }
}

describe("stand-in endpoint inventory", () => {
  test("GET /user returns the viewer login", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ login: "test-user" });
    });
  });

  test("GET /notifications returns the thread array and the poll headers", async () => {
    await withStandIn(async (standIn) => {
      standIn.setThreads([makeThread({ id: "t_001" }), makeThread({ id: "t_002" })]);
      const res = await fetch(`${standIn.url}/notifications`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as StandInThread[];
      expect(body).toHaveLength(2);
      expect(body[0]?.id).toBe("t_001");
      expect(res.headers.get("last-modified")).toBe("Fri, 16 Oct 2026 15:33:32 GMT");
      expect(res.headers.get("x-poll-interval")).toBe("60");
    });
  });

  test("GET /notifications/threads/{id} returns one thread", async () => {
    await withStandIn(async (standIn) => {
      standIn.setThreads([makeThread({ id: "t_042" })]);
      const res = await fetch(`${standIn.url}/notifications/threads/t_042`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as StandInThread).id).toBe("t_042");
    });
  });

  test("GET /notifications/threads/{id} answers 404 for an unknown thread", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/notifications/threads/nope`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not Found" });
    });
  });

  test("PATCH and DELETE on a thread answer 205 with no body", async () => {
    await withStandIn(async (standIn) => {
      const patch = await fetch(`${standIn.url}/notifications/threads/t_001`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      expect(patch.status).toBe(205);
      expect(await patch.text()).toBe("");

      const del = await fetch(`${standIn.url}/notifications/threads/t_001`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      expect(del.status).toBe(205);
      expect(await del.text()).toBe("");
    });
  });

  test("PUT on the subscription endpoint acknowledges the ignore", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(
        `${standIn.url}/notifications/threads/t_001/subscription`,
        {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ ignored: true }),
        }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ignored: true });
    });
  });

  test("GET /repos/{owner}/{repo} returns the repository", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/repos/acme/web`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        name: "web",
        full_name: "acme/web",
        owner: { login: "acme" },
      });
    });
  });

  test("the pull and issue subject endpoints return the subject payload", async () => {
    await withStandIn(async (standIn) => {
      const pull = await fetch(`${standIn.url}/repos/acme/web/pulls/12`, {
        headers: authHeaders(),
      });
      expect(pull.status).toBe(200);
      const pullBody = (await pull.json()) as Record<string, unknown>;
      expect(pullBody.title).toBe("Fix flaky login redirect");
      expect(pullBody.state).toBe("open");
      expect(pullBody.merged).toBe(false);
      expect(pullBody.html_url).toBe("https://github.com/acme/web/pull/12");
      expect(pullBody.head).toEqual({ sha: "0123456789abcdef0123456789abcdef01234567" });

      const issue = await fetch(`${standIn.url}/repos/acme/web/issues/34`, {
        headers: authHeaders(),
      });
      expect(issue.status).toBe(200);
      const issueBody = (await issue.json()) as Record<string, unknown>;
      expect(issueBody.html_url).toBe("https://github.com/acme/web/issues/34");
    });
  });

  test("the comments endpoint returns the comment list", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/repos/acme/web/issues/12/comments`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0]?.user).toEqual({ login: "octo" });
      expect(body[0]?.body).toBe("Looks good to me.");
      expect(body[0]?.created_at).toBe("2026-01-15T10:00:00Z");
    });
  });

  test("the workflow runs endpoint returns the run list", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/repos/acme/web/actions/runs`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
      expect(body.workflow_runs).toHaveLength(1);
      expect(body.workflow_runs[0]?.name).toBe("CI");
      expect(body.workflow_runs[0]?.conclusion).toBe("success");
      expect(body.workflow_runs[0]?.head_branch).toBe("main");
    });
  });

  test("the commit status endpoint returns the status list", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(
        `${standIn.url}/repos/acme/web/commits/abc123/status`,
        { headers: authHeaders() }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ statuses: [{ state: "success" }] });
    });
  });

  test("the check-runs endpoint returns the check run list", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(
        `${standIn.url}/repos/acme/web/commits/abc123/check-runs`,
        { headers: authHeaders() }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        check_runs: [{ status: "completed", conclusion: "success" }],
      });
    });
  });

  test("GET /search/repositories returns a JSON body", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(
        `${standIn.url}/search/repositories?q=rate-limits-probe&per_page=1`,
        { headers: authHeaders() }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ total_count: 0, items: [] });
    });
  });

  test("POST /graphql returns the viewer login", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/graphql`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ viewer { login } }" }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { viewer: { login: "test-user" } } });
    });
  });

  test("POST /graphql returns the contribution calendar for a dated query", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/graphql`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "query($login: String!, $from: DateTime!, $to: DateTime!) {}",
          variables: {
            login: "test-user",
            from: "2026-01-14T00:00:00Z",
            to: "2026-01-14T23:59:59Z",
          },
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: { weeks: Array<{ contributionDays: unknown[] }> };
            };
          };
        };
      };
      const days = body.data.user.contributionsCollection.contributionCalendar.weeks[0]
        ?.contributionDays;
      expect(days).toEqual([{ date: "2026-01-14", contributionCount: 7 }]);
    });
  });

  test("GET /health answers without a credential", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });
});

describe("stand-in rate-limit headers", () => {
  test("every authenticated response carries the four rate-limit headers", async () => {
    await withStandIn(async (standIn) => {
      standIn.setThreads([makeThread({ id: "t_001" })]);
      const paths = [
        "/user",
        "/notifications",
        "/notifications/threads/t_001",
        "/repos/acme/web",
        "/repos/acme/web/pulls/12",
        "/repos/acme/web/issues/12/comments",
        "/repos/acme/web/actions/runs",
        "/repos/acme/web/commits/abc123/status",
        "/repos/acme/web/commits/abc123/check-runs",
        "/search/repositories?q=probe",
      ];
      for (const path of paths) {
        const res = await fetch(`${standIn.url}${path}`, { headers: authHeaders() });
        expect(res.status, path).toBe(200);
        expect(res.headers.get("x-ratelimit-limit"), path).toBe("5000");
        expect(res.headers.get("x-ratelimit-used"), path).toBe("1234");
        expect(res.headers.get("x-ratelimit-remaining"), path).toBe("3766");
        expect(res.headers.get("x-ratelimit-reset"), path).toBe("0");
      }
    });
  });

  test("setRateLimit changes the headers on later responses", async () => {
    await withStandIn(async (standIn) => {
      standIn.setRateLimit(60, 60, 0, 1_800_000_000);
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.headers.get("x-ratelimit-limit")).toBe("60");
      expect(res.headers.get("x-ratelimit-used")).toBe("60");
      expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
      expect(res.headers.get("x-ratelimit-reset")).toBe("1800000000");
    });
  });
});

describe("stand-in pagination", () => {
  test("the link header carries the stand-in's own port", async () => {
    await withStandIn(
      async (standIn) => {
        standIn.setThreads([
          makeThread({ id: "t_001" }),
          makeThread({ id: "t_002" }),
          makeThread({ id: "t_003" }),
        ]);
        const res = await fetch(`${standIn.url}/notifications`, {
          headers: authHeaders(),
        });
        const link = res.headers.get("link");
        expect(link).not.toBeNull();
        expect(link).toContain(`http://127.0.0.1:${standIn.port}/notifications`);
        expect(link).toContain('rel="next"');
        expect(link).toContain("page=2");
      },
      { perPage: 2 }
    );
  });

  test("the next page in the link header is reachable", async () => {
    await withStandIn(
      async (standIn) => {
        standIn.setThreads([
          makeThread({ id: "t_001" }),
          makeThread({ id: "t_002" }),
          makeThread({ id: "t_003" }),
        ]);
        const first = await fetch(`${standIn.url}/notifications`, {
          headers: authHeaders(),
        });
        const link = first.headers.get("link") ?? "";
        const url = link.match(/<([^>]+)>/)?.[1];
        expect(url).toBeDefined();
        const second = await fetch(url as string, { headers: authHeaders() });
        expect(second.status).toBe(200);
        const body = (await second.json()) as StandInThread[];
        expect(body.map((t) => t.id)).toEqual(["t_003"]);
      },
      { perPage: 2 }
    );
  });

  test("the last page carries no link header", async () => {
    await withStandIn(async (standIn) => {
      standIn.setThreads([makeThread({ id: "t_001" })]);
      const res = await fetch(`${standIn.url}/notifications`, {
        headers: authHeaders(),
      });
      expect(res.headers.get("link")).toBeNull();
    });
  });
});

describe("stand-in subject payload", () => {
  test("the payload is per item, not one shared default", async () => {
    await withStandIn(async (standIn) => {
      standIn.setSubject("/repos/acme/web/pulls/42", {
        title: "Per item title",
        body: "Per item body",
        state: "closed",
        draft: false,
        merged: true,
        user: { login: "octo" },
        html_url: "https://github.com/acme/web/pull/42",
        head: { sha: "feedface" },
      });
      const scripted = await fetch(`${standIn.url}/repos/acme/web/pulls/42`, {
        headers: authHeaders(),
      });
      expect(await scripted.json()).toEqual({
        title: "Per item title",
        body: "Per item body",
        state: "closed",
        draft: false,
        merged: true,
        user: { login: "octo" },
        html_url: "https://github.com/acme/web/pull/42",
        head: { sha: "feedface" },
      });

      const other = await fetch(`${standIn.url}/repos/acme/web/pulls/43`, {
        headers: authHeaders(),
      });
      const otherBody = (await other.json()) as Record<string, unknown>;
      expect(otherBody.title).toBe("Fix flaky login redirect");
      expect(otherBody.merged).toBe(false);
    });
  });
});

describe("stand-in credential rejection", () => {
  test("a request without a bearer token is rejected", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/user`);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Bad credentials" });
      expect(standIn.requests.at(-1)?.authorization).toBeUndefined();
    });
  });

  test("a request with the wrong bearer token is rejected", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/user`, {
        headers: { Authorization: "Bearer wrong-token" },
      });
      expect(res.status).toBe(401);
      expect(standIn.requests.at(-1)?.authorization).toBe("Bearer wrong-token");
    });
  });

  test("the expected bearer token is accepted", async () => {
    await withStandIn(async (standIn) => {
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.status).toBe(200);
      expect(standIn.requests.at(-1)?.authorization).toBe(`Bearer ${TOKEN}`);
    });
  });
});

describe("stand-in scripted scenarios", () => {
  test("a 401 scenario is served and reads as an auth failure", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/user", { status: 401 });
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.status).toBe(401);
      expect(classifyStatus(res.status, res)).toBe("auth");
    });
  });

  test("a 403 with no remaining quota reads as rate limited", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/user", { status: 403, rateLimitRemaining: 0 });
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.status).toBe(403);
      expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
      expect(classifyStatus(res.status, res)).toBe("rate_limited");
    });
  });

  test("a 403 with remaining quota reads as an auth failure", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/user", { status: 403, rateLimitRemaining: 1 });
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.status).toBe(403);
      expect(res.headers.get("x-ratelimit-remaining")).toBe("1");
      expect(classifyStatus(res.status, res)).toBe("auth");
    });
  });

  test("a 404 scenario is served as not found", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/repos/acme/web/pulls/99", { status: 404 });
      const res = await fetch(`${standIn.url}/repos/acme/web/pulls/99`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(404);
    });
  });

  test("a 500 scenario is served as a server error", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/user", { status: 500 });
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.status).toBe(500);
      expect(classifyStatus(res.status, res)).toBe("unknown");
    });
  });

  test("a delayed scenario answers after the delay", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/slow", {
        status: 200,
        body: { slow: true },
        delayMs: 60,
      });
      const started = Date.now();
      const res = await fetch(`${standIn.url}/slow`, { headers: authHeaders() });
      const elapsed = Date.now() - started;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ slow: true });
      expect(elapsed).toBeGreaterThanOrEqual(55);
    });
  });

  test("a wildcard scenario matches every path under it", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/repos/acme/*", { status: 500 });
      const res = await fetch(`${standIn.url}/repos/acme/web/pulls/1`, {
        headers: authHeaders(),
      });
      expect(res.status).toBe(500);
    });
  });

  test("clearing a scenario restores the default response", async () => {
    await withStandIn(async (standIn) => {
      standIn.setScenario("/user", { status: 500 });
      expect((await fetch(`${standIn.url}/user`, { headers: authHeaders() })).status).toBe(500);
      standIn.setScenario("/user", null);
      expect((await fetch(`${standIn.url}/user`, { headers: authHeaders() })).status).toBe(200);
    });
  });
});

describe("stand-in controller", () => {
  test("every request is recorded with its method, path and credential", async () => {
    await withStandIn(async (standIn) => {
      await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      await fetch(`${standIn.url}/notifications`, { headers: authHeaders() });
      await fetch(`${standIn.url}/notifications/threads/t_001/subscription`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ignored: true }),
      });
      expect(standIn.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        "GET /user",
        "GET /notifications",
        "PUT /notifications/threads/t_001/subscription",
      ]);
      expect(standIn.requests[2]?.body).toBe(JSON.stringify({ ignored: true }));
    });
  });

  test("reset clears the scenarios, the threads and the request log", async () => {
    await withStandIn(async (standIn) => {
      standIn.setThreads([makeThread({ id: "t_001" })]);
      standIn.setScenario("/user", { status: 500 });
      standIn.setRateLimit(1, 1, 0, 5);
      await fetch(`${standIn.url}/user`, { headers: authHeaders() });

      standIn.reset();

      expect(standIn.requests).toHaveLength(0);
      const res = await fetch(`${standIn.url}/user`, { headers: authHeaders() });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-ratelimit-limit")).toBe("5000");
      const threads = await fetch(`${standIn.url}/notifications`, {
        headers: authHeaders(),
      });
      expect(await threads.json()).toEqual([]);
    });
  });

  test("setThreads replaces the served thread list", async () => {
    await withStandIn(async (standIn) => {
      standIn.setThreads([makeThread({ id: "t_001" })]);
      standIn.setThreads([makeThread({ id: "t_009" })]);
      const res = await fetch(`${standIn.url}/notifications`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as StandInThread[];
      expect(body.map((t) => t.id)).toEqual(["t_009"]);
    });
  });
});

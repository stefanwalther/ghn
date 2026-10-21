import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  fetchCheckSummary,
  fetchSubjectContent,
  fetchThreadComments,
  listNotifications,
  resolveSubjectHtmlUrl,
  type GhThread,
} from "@/lib/github";

interface Recorded {
  url: string;
  method: string;
}

function stubFetch(
  responder: (call: Recorded) => Response | Promise<Response>
): Recorded[] {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: unknown, init?: { method?: string }) => {
      const call: Recorded = { url: String(input), method: init?.method ?? "GET" };
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
  process.env.GHN_API_BASE = "https://api.example.test";
});

afterEach(() => {
  delete process.env.GHN_API_BASE;
  vi.unstubAllGlobals();
});

describe("the thread defaults", () => {
  // A thread that carries only the fields GitHub always sends is stored
  // with the defaults for everything else.
  test("a bare thread is stored with the defaults", async () => {
    stubFetch(() =>
      json([
        {
          id: 42,
          updated_at: "2026-10-16T10:00:00Z",
          subject: {},
          repository: {},
        },
      ])
    );
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.threads[0]).toEqual({
      id: "42",
      unread: false,
      reason: "subscribed",
      updatedAt: Date.parse("2026-10-16T10:00:00Z"),
      subjectTitle: "Untitled",
      subjectType: "Issue",
      subjectApiUrl: "",
      repoFullName: "",
      repoOwnerLogin: "",
      repoHtmlUrl: "",
      threadUrl: "",
    });
  });

  // A thread whose timestamp cannot be read cannot be stored, because the
  // inbox sorts by it.
  test("a thread with an unreadable timestamp is dropped", async () => {
    stubFetch(() =>
      json([
        {
          id: "7",
          updated_at: "not a date",
          subject: { title: "T", type: "Issue", url: "u" },
          repository: { full_name: "a/b", html_url: "h", owner: { login: "a" } },
        },
      ])
    );
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.threads).toEqual([]);
  });

  // A thread without a timestamp at all cannot be stored either.
  test("a thread without a timestamp is dropped", async () => {
    stubFetch(() =>
      json([
        {
          id: "8",
          subject: { title: "T", type: "Issue", url: "u" },
          repository: { full_name: "a/b", html_url: "h", owner: { login: "a" } },
        },
      ])
    );
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.threads).toEqual([]);
  });
});

describe("the pagination link", () => {
  // A link header without a "next" relation ends the pagination.
  test("a link header without a next relation ends the pagination", async () => {
    const calls = stubFetch(() =>
      new Response("[]", {
        headers: {
          link: '<https://api.example.test/notifications?page=1>; rel="first"',
        },
      })
    );
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.threads).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  // A conditional request that is answered with 304 has no modification
  // time of its own.
  test("a 304 without a conditional header has no modification time", async () => {
    stubFetch(() => new Response(null, { status: 304 }));
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.notModified).toBe(true);
    expect(result.data?.lastModified).toBeNull();
  });

  // A poll interval that cannot be used keeps the default, because the
  // inbox holds the refresh back for a fixed time otherwise.
  test("a poll interval that cannot be used keeps the default", async () => {
    stubFetch(() => new Response("[]", { headers: { "x-poll-interval": "0" } }));
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.pollIntervalSecs).toBe(60);
  });

  // A poll interval that is not a number keeps the default as well.
  test("a poll interval that is not a number keeps the default", async () => {
    stubFetch(() => new Response("[]", { headers: { "x-poll-interval": "soon" } }));
    const result = await listNotifications("token", {});
    expect(result.ok).toBe(true);
    expect(result.data?.pollIntervalSecs).toBe(60);
  });
});

describe("the subject defaults", () => {
  // A subject payload without the optional fields is read with the
  // defaults for them.
  test("a bare subject payload is read with the defaults", async () => {
    stubFetch(() =>
      json({ title: "T", html_url: "https://github.com/acme/web/pull/12" })
    );
    const content = await fetchSubjectContent(
      "token",
      "https://api.example.test/repos/acme/web/pulls/12"
    );
    expect(content).toEqual({
      title: "T",
      body: null,
      state: null,
      authorLogin: null,
      htmlUrl: "https://github.com/acme/web/pull/12",
      draft: null,
      merged: null,
      headSha: null,
    });
  });

  // A payload that carries the head commit keeps it.
  test("a payload with a head commit keeps the head sha", async () => {
    stubFetch(() =>
      json({
        title: "T",
        html_url: "https://github.com/acme/web/pull/12",
        head: { sha: "0123456789abcdef" },
      })
    );
    const content = await fetchSubjectContent(
      "token",
      "https://api.example.test/repos/acme/web/pulls/12"
    );
    expect(content?.headSha).toBe("0123456789abcdef");
  });
});

describe("the thread comments", () => {
  // A comment without a readable timestamp cannot be placed on the
  // timeline, so it is dropped.
  test("a comment without a readable timestamp is dropped", async () => {
    stubFetch(() =>
      json([
        { user: { login: "octo" }, body: "no date at all" },
        { user: { login: "octo" }, body: "bad date", created_at: "not a date" },
        { user: { login: "octo" }, body: "good", created_at: "2026-10-16T10:00:00Z" },
      ])
    );
    const comments = await fetchThreadComments(
      "token",
      "https://api.example.test/repos/acme/web/issues/12/comments"
    );
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe("good");
  });
});

describe("the check summary", () => {
  // Only passing contexts means the checks passed.
  test("only passing contexts mean the checks passed", async () => {
    stubFetch(() => json({ statuses: [{ state: "success" }] }));
    const summary = await fetchCheckSummary("token", {
      owner: "acme",
      repo: "web",
      sha: "abc123",
    });
    expect(summary).toEqual({ state: "success", passing: 1, total: 1 });
  });

  // A check run that timed out is a failure, not a pending run.
  test("a check run that timed out is a failure", async () => {
    stubFetch((call) => {
      if (call.url.includes("/check-runs")) {
        return json({ check_runs: [{ status: "completed", conclusion: "timed_out" }] });
      }
      return json({ statuses: [] });
    });
    const summary = await fetchCheckSummary("token", {
      owner: "acme",
      repo: "web",
      sha: "abc123",
    });
    expect(summary).toEqual({ state: "failure", passing: 0, total: 1 });
  });

  // A cancelled run and a run that needs an action are failures too.
  test("a cancelled run and a run needing an action are failures", async () => {
    stubFetch((call) => {
      if (call.url.includes("/check-runs")) {
        return json({
          check_runs: [
            { status: "completed", conclusion: "cancelled" },
            { status: "completed", conclusion: "action_required" },
          ],
        });
      }
      return json({ statuses: [] });
    });
    const summary = await fetchCheckSummary("token", {
      owner: "acme",
      repo: "web",
      sha: "abc123",
    });
    expect(summary).toEqual({ state: "failure", passing: 0, total: 2 });
  });

  // When the statuses cannot be read and the check runs cannot be read
  // either, the summary is unknown.
  test("unreadable statuses and runs have no summary", async () => {
    stubFetch((call) => {
      if (call.url.includes("/status")) throw new Error("connection refused");
      return new Response("{}", { status: 500 });
    });
    await expect(
      fetchCheckSummary("token", { owner: "acme", repo: "web", sha: "abc123" })
    ).resolves.toBeNull();
  });

  // When the check runs cannot be read and the statuses fail, the summary
  // is unknown as well.
  test("failed statuses and unreadable runs have no summary", async () => {
    stubFetch((call) => {
      if (call.url.includes("/check-runs")) throw new Error("connection refused");
      return new Response("{}", { status: 500 });
    });
    await expect(
      fetchCheckSummary("token", { owner: "acme", repo: "web", sha: "abc123" })
    ).resolves.toBeNull();
  });

  // A payload that cannot be read at all has no summary.
  test("a payload that cannot be read has no summary", async () => {
    stubFetch(() => new Response("not json", { status: 200 }));
    await expect(
      fetchCheckSummary("token", { owner: "acme", repo: "web", sha: "abc123" })
    ).resolves.toBeNull();
  });

  // A status payload without a statuses list carries no states.
  test("a status payload without a statuses list carries no states", async () => {
    stubFetch((call) => {
      if (call.url.includes("/status")) return json({ message: "no statuses" });
      return json({ check_runs: [{ status: "completed", conclusion: "success" }] });
    });
    const summary = await fetchCheckSummary("token", {
      owner: "acme",
      repo: "web",
      sha: "abc123",
    });
    expect(summary).toEqual({ state: "success", passing: 1, total: 1 });
  });

  // The commit statuses still count when the check runs cannot be read.
  test("the commit statuses count when the check runs cannot be read", async () => {
    stubFetch((call) => {
      if (call.url.includes("/check-runs")) return new Response("{}", { status: 500 });
      return json({ statuses: [{ state: "success" }] });
    });
    const summary = await fetchCheckSummary("token", {
      owner: "acme",
      repo: "web",
      sha: "abc123",
    });
    expect(summary).toEqual({ state: "success", passing: 1, total: 1 });
  });
});

describe("the subject url fallback", () => {
  // A subject payload without a page of its own falls back to the one the
  // subject api url identifies.
  test("a payload without a page falls back to the pull request page", async () => {
    stubFetch(() => json({ merged: false, state: "open" }));
    const url = await resolveSubjectHtmlUrl("token", thread(), new Map());
    expect(url).toBe("https://github.com/acme/web/pull/12");
  });

  // An issue falls back to the issue page, not to the pull request one.
  test("an issue falls back to the issue page", async () => {
    stubFetch(() => new Response("{}", { status: 404 }));
    const url = await resolveSubjectHtmlUrl(
      "token",
      thread({ subjectApiUrl: "https://api.github.com/repos/acme/web/issues/34" }),
      new Map()
    );
    expect(url).toBe("https://github.com/acme/web/issues/34");
  });
});

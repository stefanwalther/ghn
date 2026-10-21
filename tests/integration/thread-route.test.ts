import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { startGitHubStandIn, type StandIn } from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { notifications, syncState } from "@/db/schema";
import { fetchCheckSummary } from "@/lib/github";
import { buildSeedNotifications, seedSubjectPath } from "@/lib/seed-data";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `GET /api/thread` and `POST /api/thread/sync`.
 *
 * The drawer shows the subject, the comments and the check summary of one
 * notification. The global fetch is guarded here as well, because the check
 * summary and the workflow runs do not follow `GHN_API_BASE`. The guard is
 * what keeps this file away from the real GitHub service, and the blocked
 * list is asserted so the gap stays visible.
 */

const NOW = Date.parse("2026-01-15T12:00:00Z");
const TOKEN = "test-token";
const SHA = "0123456789abcdef0123456789abcdef01234567";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const blocked: string[] = [];
const realFetch = globalThis.fetch;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

beforeAll(() => {
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = urlOf(input);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      host = "";
    }
    if (!LOOPBACK.has(host)) {
      blocked.push(url);
      throw new Error(`network access blocked: ${url}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

interface ThreadPayload {
  title: string;
  body: string | null;
  state: string | null;
  authorLogin: string | null;
  htmlUrl: string;
  draft: boolean | null;
  merged: boolean | null;
  headSha: string | null;
  comments: Array<{ authorLogin: string; body: string; createdAt: number }>;
  checks: { state: string; passing: number; total: number } | null;
  runs: Array<Record<string, unknown>>;
}

async function openThread(id: string): Promise<ThreadPayload> {
  const { GET } = await import("@/app/api/thread/route");
  const res = await GET(new Request(`http://localhost/api/thread?id=${id}`));
  expect(res.status).toBe(200);
  return (await res.json()) as ThreadPayload;
}

async function syncThread(payload: unknown) {
  const { POST } = await import("@/app/api/thread/sync/route");
  const res = await POST(
    new Request("http://localhost/api/thread/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  standIn = await startGitHubStandIn({ token: TOKEN });
});

afterAll(async () => {
  await standIn.close();
});

beforeEach(async () => {
  blocked.length = 0;
  standIn.reset();
  standIn.setSubject("/repos/acme/web/pulls/1", {
    title: "Fix flaky login redirect",
    body: "The redirect races the session load.",
    state: "closed",
    draft: false,
    merged: true,
    user: { login: "octo" },
    html_url: "https://github.com/acme/web/pull/1",
    head: { sha: SHA },
  });
  standIn.setSubject("/repos/acme/api/issues/1", {
    title: "Bump dependency range",
    body: "Bumps the range.",
    state: "open",
    draft: false,
    merged: false,
    user: { login: "octo" },
    html_url: "https://github.com/acme/api/issues/1",
    head: { sha: SHA },
  });
  restoreEnv = withEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
  });
  await db.delete(notifications);
  // The sync state has to be cleared as well, so a check that writes it
  // cannot leak into the next one.
  await db.delete(syncState);
  await seedTestDataset(db, NOW);
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("GET /api/thread", () => {
  test("a missing id is refused", async () => {
    const { GET } = await import("@/app/api/thread/route");
    const res = await GET(new Request("http://localhost/api/thread"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing id" });
  });

  test("an unknown notification is not found", async () => {
    const { GET } = await import("@/app/api/thread/route");
    const res = await GET(new Request("http://localhost/api/thread?id=nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  test("without a credential the drawer reports an auth failure", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });
    const { GET } = await import("@/app/api/thread/route");
    const res = await GET(new Request("http://localhost/api/thread?id=n_001"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "auth" });
    expect(blocked).toEqual([]);
  });

  test("the payload comes from the stand-in", async () => {
    const payload = await openThread("n_001");
    expect(payload.title).toBe("Fix flaky login redirect");
    expect(payload.body).toBe("The redirect races the session load.");
    expect(payload.state).toBe("closed");
    expect(payload.authorLogin).toBe("octo");
    expect(payload.htmlUrl).toBe("https://github.com/acme/web/pull/1");
    expect(payload.draft).toBe(false);
    expect(payload.merged).toBe(true);
    expect(payload.headSha).toBe(SHA);
  });

  test("the comments come from the stand-in", async () => {
    const payload = await openThread("n_001");
    expect(payload.comments).toEqual([
      {
        authorLogin: "octo",
        body: "Looks good to me.",
        createdAt: Date.parse("2026-01-15T10:00:00Z"),
      },
    ]);
  });

  test("an issue has no check summary and needs nothing outside the loopback", async () => {
    const payload = await openThread("n_002");
    expect(payload.title).toBe("Bump dependency range");
    expect(payload.state).toBe("open");
    expect(payload.checks).toBeNull();
    expect(blocked).toEqual([]);
  });

  test("a pull request asks for a check summary outside the api base", async () => {
    // The check summary probes the commit status and the check runs, and
    // both of them use the base the rest of the application uses.
    const payload = await openThread("n_001");
    expect(payload.checks).toEqual({ state: "success", passing: 2, total: 2 });
    expect(blocked).toEqual([]);
  });

  test("the check summary reads the stand-in when the caller names the base", async () => {
    const summary = await fetchCheckSummary(TOKEN, {
      owner: "acme",
      repo: "web",
      sha: SHA,
      apiBase: standIn.url,
    });
    expect(summary).toEqual({ state: "success", passing: 2, total: 2 });
    expect(blocked).toEqual([]);
  });

  test("a check suite lists the workflow runs", async () => {
    await db.insert(notifications).values({
      id: "cs_001",
      repositoryId: "acme--web",
      subject: "CI workflow run failed for main branch",
      subjectType: "CheckSuite",
      subjectState: null,
      reason: "ci_failed",
      createdAt: NOW - 3600 * 1000,
      githubUpdatedAt: null,
      isRead: 0,
      isDone: 0,
      localUnread: 0,
      sourceUrl: "https://github.com/acme/web",
    });
    const { GET } = await import("@/app/api/thread/route");
    const res = await GET(new Request("http://localhost/api/thread?id=cs_001"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: null;
      comments: unknown[];
      checks: null;
      runs: unknown[];
    };
    expect(body.content).toBeNull();
    expect(body.comments).toEqual([]);
    expect(body.checks).toBeNull();
    // The workflow runs are read from the same base as everything else.
    expect(body.runs).toEqual([
      {
        name: "CI",
        htmlUrl: "https://github.com/acme/web/actions/runs/1",
        status: "completed",
        conclusion: "success",
        branch: "main",
        createdAt: Date.parse("2026-01-15T09:00:00Z"),
      },
    ]);
    expect(blocked).toEqual([]);
  });
});

describe("the seeded subject paths", () => {
  test("the subject path of a seeded row matches its source url", async () => {
    // The stand-in keys its per-item payload by the subject path, and the
    // drawer addresses the row by its source url. The two have to agree, or
    // the drawer reads the payload of a different item.
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n_001"));
    const sourceUrl = rows[0]?.sourceUrl ?? "";
    const numberInSourceUrl = Number(sourceUrl.split("/").pop());
    const item = buildSeedNotifications(NOW).find((n) => n.id === "n_001");
    if (!item) throw new Error("the seed has no item n_001");
    expect(item.number).toBe(numberInSourceUrl);
    expect(seedSubjectPath(item)).toBe("/repos/acme/web/pulls/1");
  });

  test("a seeded row is read through its own payload", async () => {
    const item = buildSeedNotifications(NOW).find((n) => n.id === "n_003");
    if (!item) throw new Error("the seed has no item n_003");
    standIn.setSubject(seedSubjectPath(item), {
      title: item.subject,
      body: "The redirect races the session load.",
      state: item.subjectState,
      draft: false,
      merged: item.prMerged,
      user: { login: "octo" },
      html_url: item.sourceUrl,
      head: { sha: SHA },
    });

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n_003"));
    expect(rows[0]?.subject).toBe("Add empty state for inbox");

    const payload = await openThread("n_003");
    expect(payload.title).toBe("Add empty state for inbox");
    expect(payload.title).toBe(item.subject);
  });
});

describe("POST /api/thread/sync", () => {
  test("a missing id is refused", async () => {
    const { status, body } = await syncThread({});
    expect(status).toBe(400);
    expect(body.error).toBe("missing id");
  });

  test("an id that is not a string is refused", async () => {
    const { status } = await syncThread({ id: 42 });
    expect(status).toBe(400);
  });

  test("an unknown notification is not found", async () => {
    const { status, body } = await syncThread({ id: "nope" });
    expect(status).toBe(404);
    expect(body.error).toBe("not found");
  });

  test("without a credential the sync reports an auth failure", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_TOKEN: "",
      GHN_API_BASE: standIn.url,
      GHN_NOW: String(NOW),
    });
    const { status, body } = await syncThread({ id: "n_001" });
    expect(status).toBe(503);
    expect(body).toEqual({ error: "auth", retryable: true });
  });

  test("a thread that is gone from GitHub is marked done", async () => {
    const { status, body } = await syncThread({ id: "n_001" });
    expect(status).toBe(200);
    expect(body).toEqual({ gone: true, id: "n_001" });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n_001"));
    expect(rows[0]?.isDone).toBe(1);
  });

  test("a thread that is still there updates the notification", async () => {
    standIn.setThreads([
      {
        id: "n_001",
        unread: true,
        reason: "review_requested",
        updated_at: "2026-01-15T11:30:00Z",
        subject: {
          title: "Fix flaky login redirect",
          type: "PullRequest",
          url: `${standIn.url}/repos/acme/web/pulls/1`,
        },
        repository: {
          full_name: "acme/web",
          html_url: "https://github.com/acme/web",
          owner: { login: "acme" },
        },
        url: `${standIn.url}/notifications/threads/n_001`,
      },
    ]);
    const { status, body } = await syncThread({ id: "n_001" });
    expect(status).toBe(200);
    expect(body.gone).toBe(false);
    expect(body.item).toEqual({
      id: "n_001",
      subject: "Fix flaky login redirect",
      subjectType: "PullRequest",
      subjectState: "closed",
      reason: "review_requested",
      prMerged: true,
      createdAt: Date.parse("2026-01-15T11:30:00Z"),
      isRead: 0,
      sourceUrl: "https://github.com/acme/web/pull/1",
    });

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, "n_001"));
    expect(rows[0]?.subject).toBe("Fix flaky login redirect");
    expect(rows[0]?.subjectState).toBe("closed");
    expect(rows[0]?.prMerged).toBe(1);
    expect(rows[0]?.reason).toBe("review_requested");
    expect(rows[0]?.createdAt).toBe(Date.parse("2026-01-15T11:30:00Z"));
    expect(rows[0]?.githubUpdatedAt).toBe(Date.parse("2026-01-15T11:30:00Z"));
    expect(rows[0]?.isRead).toBe(0);
    expect(rows[0]?.isDone).toBe(0);
    expect(blocked).toEqual([]);
  });

  test("a locally unread notification stays unread", async () => {
    await db
      .update(notifications)
      .set({ localUnread: 1, isRead: 0 })
      .where(eq(notifications.id, "n_001"));
    standIn.setThreads([
      {
        id: "n_001",
        unread: false,
        reason: "mention",
        updated_at: "2026-01-15T11:30:00Z",
        subject: {
          title: "Fix flaky login redirect",
          type: "PullRequest",
          url: `${standIn.url}/repos/acme/web/pulls/1`,
        },
        repository: {
          full_name: "acme/web",
          html_url: "https://github.com/acme/web",
          owner: { login: "acme" },
        },
        url: `${standIn.url}/notifications/threads/n_001`,
      },
    ]);
    const { body } = await syncThread({ id: "n_001" });
    expect((body.item as { isRead: number }).isRead).toBe(0);
  });
});

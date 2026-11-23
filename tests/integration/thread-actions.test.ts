import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../support/db-client.node";
import { seedTestDataset } from "../support/fixtures";
import { startGitHubStandIn, type StandIn } from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { notifications } from "@/db/schema";

vi.mock("@/db/client", async () => {
  const mod = await import("../support/db-client.node");
  return { db: mod.db };
});

/**
 * `GET /api/thread` pull enrichment and `POST /api/thread/actions`.
 *
 * The drawer resolves exactly one primary control from the enriched pull
 * payload plus the repository merge settings, and every drawer action runs
 * through the actions endpoint. The endpoint derives owner/repo/number from
 * the stored notification row, so the client cannot act on another pull.
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

async function postAction(body: unknown) {
  const { POST } = await import("@/app/api/thread/actions/route");
  const res = await POST(
    new Request("http://localhost/api/thread/actions", {
      method: "POST",
      body: JSON.stringify(body),
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
    state: "open",
    draft: false,
    merged: false,
    mergeable: true,
    mergeable_state: "clean",
    merged_by: null,
    merge_commit_sha: null,
    base: { ref: "main", sha: "base0123456789abcdef0123456789abcdef" },
    head: { ref: "fix-login", sha: SHA },
    additions: 10,
    deletions: 2,
    changed_files: 1,
    labels: [{ name: "bug" }],
    node_id: "PR_test_node_1",
    requested_reviewers: [{ login: "reviewer" }],
    user: { login: "octo" },
    html_url: "https://github.com/acme/web/pull/1",
  });
  standIn.setReviews([
    { user: { login: "teammate" }, state: "APPROVED" },
    { user: { login: "greptile" }, state: "COMMENTED" },
  ]);
  restoreEnv = withEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_NOW: String(NOW),
  });
  await db.delete(notifications);
  await seedTestDataset(db, NOW);
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("pull enrichment on GET /api/thread", () => {
  test("a pull request carries its merge settings and review verdict", async () => {
    const { GET } = await import("@/app/api/thread/route");
    const res = await GET(new Request("http://localhost/api/thread?id=n_001"));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      pull: Record<string, unknown>;
      repoSettings: Record<string, unknown>;
    };
    expect(payload.pull.mergeable).toBe(true);
    expect(payload.pull.mergeableState).toBe("clean");
    expect(payload.pull.baseRef).toBe("main");
    expect(payload.pull.headRef).toBe("fix-login");
    expect(payload.pull.additions).toBe(10);
    expect(payload.pull.labels).toEqual(["bug"]);
    expect(payload.pull.nodeId).toBe("PR_test_node_1");
    expect(payload.pull.reviewVerdict).toBe("approved");
    expect(payload.pull.approvals).toBe(1);
    expect(payload.pull.requestedReviewers).toEqual(["reviewer"]);
    expect(payload.repoSettings).toEqual({
      allowMergeCommit: true,
      allowSquashMerge: true,
      allowRebaseMerge: true,
      allowAutoMerge: true,
      defaultBranch: "main",
    });
    expect(blocked).toEqual([]);
  });

  test("a changes-requested review wins over approvals", async () => {
    standIn.setReviews([
      { user: { login: "teammate" }, state: "APPROVED" },
      { user: { login: "lead" }, state: "CHANGES_REQUESTED" },
    ]);
    const { GET } = await import("@/app/api/thread/route");
    const res = await GET(new Request("http://localhost/api/thread?id=n_001"));
    const payload = (await res.json()) as { pull: Record<string, unknown> };
    expect(payload.pull.reviewVerdict).toBe("changes_requested");
    expect(payload.pull.changesRequested).toBe(1);
  });
});

describe("POST /api/thread/actions", () => {
  test("a missing id is refused", async () => {
    const { status, body } = await postAction({ action: "merge" });
    expect(status).toBe(400);
    expect(body.error).toBe("missing id");
  });

  test("an unknown action is refused", async () => {
    const { status, body } = await postAction({ id: "n_001", action: "teleport" });
    expect(status).toBe(400);
    expect(body.error).toBe("unknown action");
  });

  test("an unknown notification is not found", async () => {
    const { status, body } = await postAction({ id: "nope", action: "merge" });
    expect(status).toBe(404);
    expect(body.error).toBe("not found");
  });

  test("without a credential the action reports an auth failure", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({ GHN_TOKEN: "", GHN_API_BASE: standIn.url, GHN_NOW: String(NOW) });
    const { status } = await postAction({ id: "n_001", action: "merge" });
    expect(status).toBe(503);
  });

  test("merge puts the chosen method to the merge endpoint", async () => {
    const { status, body } = await postAction({
      id: "n_001",
      action: "merge",
      method: "squash",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const merge = standIn.requests.find((r) => r.path === "/repos/acme/web/pulls/1/merge");
    expect(merge?.method).toBe("PUT");
    expect(merge && JSON.parse(merge.body ?? "{}")).toEqual({ merge_method: "squash" });
    expect(blocked).toEqual([]);
  });

  test("close and reopen patch the pull state", async () => {
    const closed = await postAction({ id: "n_001", action: "close" });
    expect(closed.status).toBe(200);
    const reopened = await postAction({ id: "n_001", action: "reopen" });
    expect(reopened.status).toBe(200);
    const patches = standIn.requests.filter((r) => r.path === "/repos/acme/web/pulls/1");
    expect(patches.map((r) => JSON.parse(r.body ?? "{}"))).toEqual([
      { state: "closed" },
      { state: "open" },
    ]);
  });

  test("enable auto-merge uses the pull node id over graphql", async () => {
    const { status, body } = await postAction({
      id: "n_001",
      action: "enable_auto_merge",
      method: "squash",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const gql = standIn.requests.find((r) => r.path === "/graphql");
    expect(gql?.method).toBe("POST");
    expect(gql?.body).toContain("enablePullRequestAutoMerge");
    expect(gql?.body).toContain("PR_test_node_1");
  });

  test("ready-for-review uses the pull node id over graphql", async () => {
    const { status, body } = await postAction({ id: "n_001", action: "ready_for_review" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const gql = standIn.requests.find((r) => r.path === "/graphql");
    expect(gql?.body).toContain("markPullRequestReadyForReview");
  });

  test("delete-branch refuses the default branch", async () => {
    standIn.setSubject("/repos/acme/web/pulls/1", {
      title: "Fix flaky login redirect",
      body: "x",
      state: "open",
      draft: false,
      merged: true,
      mergeable: true,
      mergeable_state: "clean",
      base: { ref: "main", sha: "base" },
      head: { ref: "main", sha: SHA },
      labels: [],
      node_id: "PR_test_node_1",
      requested_reviewers: [],
      user: { login: "octo" },
      html_url: "https://github.com/acme/web/pull/1",
    });
    const { status, body } = await postAction({ id: "n_001", action: "delete_branch" });
    expect(status).toBe(422);
    expect(body.error).toBe("no deletable branch");
  });
});

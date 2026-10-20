import { describe, expect, test } from "bun:test";
import {
  fetchCheckSummary,
  fetchSubjectContent,
  fetchThreadComments,
  fetchWorkflowRuns,
  findPinnedRun,
  formatRunAge,
  parseBranchFromTitle,
  parsePullCoords,
  parseRepoCoords,
  parseWorkflowNameFromTitle,
  subjectApiUrlFromHtml,
  subjectCommentsUrlFromHtml,
} from "@/lib/github";

describe("subjectApiUrlFromHtml", () => {
  test("pull and issue pages map to api urls", () => {
    expect(subjectApiUrlFromHtml("https://github.com/acme/web/pull/12")).toBe(
      "https://api.github.com/repos/acme/web/pulls/12"
    );
    expect(subjectApiUrlFromHtml("https://github.com/acme/web/issues/34")).toBe(
      "https://api.github.com/repos/acme/web/issues/34"
    );
  });

  test("unknown shapes return null", () => {
    expect(subjectApiUrlFromHtml("https://github.com/acme/web")).toBeNull();
    expect(subjectApiUrlFromHtml("not a url")).toBeNull();
  });
});

describe("fetchSubjectContent", () => {
  test("returns title body state author from fixture", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          JSON.stringify({
            title: "Fix it",
            body: "Details here",
            state: "open",
            user: { login: "octo" },
            html_url: "https://github.com/acme/web/pull/12",
          }),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const content = await fetchSubjectContent(
        "token",
        `http://localhost:${server.port}/repos/acme/web/pulls/12`
      );
      expect(content?.title).toBe("Fix it");
      expect(content?.body).toBe("Details here");
      expect(content?.state).toBe("open");
      expect(content?.authorLogin).toBe("octo");
    } finally {
      server.stop(true);
    }
  });

  test("returns null on missing subject", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("{}", { headers: { "Content-Type": "application/json" } }),
    });
    try {
      const content = await fetchSubjectContent(
        "token",
        `http://localhost:${server.port}/repos/acme/web/pulls/99`
      );
      expect(content).toBeNull();
    } finally {
      server.stop(true);
    }
  });

  test("pull payload carries draft and merged flags", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          JSON.stringify({
            title: "WIP thing",
            body: null,
            state: "open",
            draft: true,
            merged: false,
            user: { login: "octo" },
            html_url: "https://github.com/acme/web/pull/12",
          }),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const content = await fetchSubjectContent(
        "token",
        `http://localhost:${server.port}/repos/acme/web/pulls/12`
      );
      expect(content?.draft).toBe(true);
      expect(content?.merged).toBe(false);
    } finally {
      server.stop(true);
    }
  });
});

describe("subjectCommentsUrlFromHtml", () => {
  test("pull and issue pages map to the issue-comments endpoint", () => {
    expect(subjectCommentsUrlFromHtml("https://github.com/acme/web/pull/12")).toBe(
      "https://api.github.com/repos/acme/web/issues/12/comments"
    );
    expect(subjectCommentsUrlFromHtml("https://github.com/acme/web/issues/34")).toBe(
      "https://api.github.com/repos/acme/web/issues/34/comments"
    );
  });

  test("unknown shapes return null", () => {
    expect(subjectCommentsUrlFromHtml("https://github.com/acme/web")).toBeNull();
  });
});

describe("parseRepoCoords", () => {
  test("repo page url maps to owner and repo", () => {
    expect(parseRepoCoords("https://github.com/acme/web")).toEqual({
      owner: "acme",
      repo: "web",
    });
    expect(parseRepoCoords("https://github.com/acme/web/")).toEqual({
      owner: "acme",
      repo: "web",
    });
  });

  test("non-repo urls return null", () => {
    expect(parseRepoCoords("https://github.com/acme/web/pull/12")).toBeNull();
    expect(parseRepoCoords("not a url")).toBeNull();
  });
});

describe("parseBranchFromTitle", () => {
  test("picks the branch out of failure titles", () => {
    expect(parseBranchFromTitle("CI workflow run failed for main branch")).toBe("main");
    expect(parseBranchFromTitle("CI workflow run failed for t3/slack-sync branch")).toBe(
      "t3/slack-sync"
    );
  });

  test("returns null without a branch phrase", () => {
    expect(parseBranchFromTitle("Weekly digest")).toBeNull();
    expect(parseBranchFromTitle("")).toBeNull();
  });
});

describe("parseWorkflowNameFromTitle", () => {
  test("picks the workflow out of failure titles", () => {
    expect(parseWorkflowNameFromTitle("Release Please workflow run failed for main branch")).toBe(
      "Release Please"
    );
    expect(parseWorkflowNameFromTitle("tracing workflow run failed for t3/specify-recall-7843 branch")).toBe(
      "tracing"
    );
  });

  test("returns null without a workflow phrase", () => {
    expect(parseWorkflowNameFromTitle("Weekly digest")).toBeNull();
    expect(parseWorkflowNameFromTitle("")).toBeNull();
  });
});

describe("findPinnedRun", () => {
  const base = {
    htmlUrl: "https://github.com/acme/web/actions/runs/1",
    status: "completed",
    branch: "main",
  };
  test("pins the matching run closest before the notification", () => {
    const runs = [
      { ...base, name: "tracing", conclusion: "success", createdAt: Date.parse("2026-10-19T18:14:22Z") },
      { ...base, name: "tracing", conclusion: "failure", createdAt: Date.parse("2026-10-19T18:10:31Z") },
      { ...base, name: "tracing", conclusion: "failure", createdAt: Date.parse("2026-10-19T18:10:24Z") },
    ];
    const pinned = findPinnedRun(runs, "tracing", Date.parse("2026-10-19T18:11:10Z"));
    expect(pinned?.createdAt).toBe(Date.parse("2026-10-19T18:10:31Z"));
  });

  test("ignores runs created after the notification slack and null workflow", () => {
    const runs = [
      { ...base, name: "tracing", conclusion: "success", createdAt: Date.parse("2026-10-19T18:14:22Z") },
    ];
    expect(findPinnedRun(runs, "tracing", Date.parse("2026-10-19T18:11:10Z"))).toBeNull();
    expect(findPinnedRun(runs, null, Date.parse("2026-10-19T18:11:10Z"))).toBeNull();
  });
});

describe("formatRunAge", () => {
  test("formats minutes hours and days", () => {
    const now = Date.parse("2026-10-19T20:00:00Z");
    expect(formatRunAge(now - 5 * 60000, now)).toBe("5m ago");
    expect(formatRunAge(now - 3 * 3600000, now)).toBe("3h ago");
    expect(formatRunAge(now - 48 * 3600000, now)).toBe("2d ago");
  });
});

describe("fetchWorkflowRuns", () => {
  test("maps recent runs from fixture", async () => {
    let seenUrl = "";
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        seenUrl = new URL(req.url).pathname + new URL(req.url).search;
        return new Response(
          JSON.stringify({
            total_count: 2,
            workflow_runs: [
              {
                name: "CI",
                html_url: "https://github.com/acme/web/actions/runs/1",
                status: "completed",
                conclusion: "failure",
                head_branch: "main",
                created_at: "2026-10-17T10:00:00Z",
              },
              {
                name: "Lint",
                html_url: "https://github.com/acme/web/actions/runs/2",
                status: "in_progress",
                conclusion: null,
                head_branch: "main",
                created_at: "2026-10-17T11:00:00Z",
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    });
    try {
      const runs = await fetchWorkflowRuns("token", {
        owner: "acme",
        repo: "web",
        branch: "main",
        apiBase: `http://localhost:${server.port}`,
      });
      expect(runs).toHaveLength(2);
      expect(runs[0]).toEqual({
        name: "CI",
        htmlUrl: "https://github.com/acme/web/actions/runs/1",
        status: "completed",
        conclusion: "failure",
        branch: "main",
        createdAt: Date.parse("2026-10-17T10:00:00Z"),
      });
      expect(runs[1]?.conclusion).toBeNull();
      expect(seenUrl).toContain("branch=main");
    } finally {
      server.stop(true);
    }
  });

  test("omits the branch param when unknown", async () => {
    let seenUrl = "";
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        seenUrl = new URL(req.url).pathname + new URL(req.url).search;
        return new Response(JSON.stringify({ total_count: 0, workflow_runs: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    try {
      const runs = await fetchWorkflowRuns("token", {
        owner: "acme",
        repo: "web",
        branch: null,
        apiBase: `http://localhost:${server.port}`,
      });
      expect(runs).toEqual([]);
      expect(seenUrl).not.toContain("branch=");
    } finally {
      server.stop(true);
    }
  });
});

describe("fetchThreadComments", () => {  test("returns author body timestamp from fixture", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          JSON.stringify([
            { user: { login: "octo" }, body: "Looks good", created_at: "2026-10-16T10:00:00Z" },
            { user: { login: null }, body: null, created_at: "bad-date" },
          ]),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const comments = await fetchThreadComments(
        "token",
        `http://localhost:${server.port}/repos/acme/web/issues/12/comments`
      );
      expect(comments).toHaveLength(1);
      expect(comments[0]).toEqual({
        authorLogin: "octo",
        body: "Looks good",
        createdAt: Date.parse("2026-10-16T10:00:00Z"),
      });
    } finally {
      server.stop(true);
    }
  });
});

describe("parsePullCoords", () => {
  test("pull api url yields owner repo number", () => {
    expect(parsePullCoords("https://api.github.com/repos/acme/web/pulls/12")).toEqual({
      owner: "acme",
      repo: "web",
      number: 12,
    });
  });

  test("non-pull urls return null", () => {
    expect(parsePullCoords("https://api.github.com/repos/acme/web/issues/12")).toBeNull();
    expect(parsePullCoords("not a url")).toBeNull();
  });
});

describe("fetchCheckSummary", () => {
  test("counts passing and failing contexts from fixture", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          JSON.stringify({
            state: "failure",
            statuses: [
              { state: "success", context: "ci/build" },
              { state: "failure", context: "ci/test" },
              { state: "pending", context: "ci/lint" },
            ],
          }),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const summary = await fetchCheckSummary("token", {
        owner: "acme",
        repo: "web",
        sha: "abc123",
        apiBase: `http://localhost:${server.port}`,
      });
      expect(summary).toEqual({ state: "failure", passing: 1, total: 3 });
    } finally {
      server.stop(true);
    }
  });

  test("no statuses means no checks", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(JSON.stringify({ state: "pending", statuses: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
    });
    try {
      const summary = await fetchCheckSummary("token", {
        owner: "acme",
        repo: "web",
        sha: "abc123",
        apiBase: `http://localhost:${server.port}`,
      });
      expect(summary).toEqual({ state: "pending", passing: 0, total: 0 });
    } finally {
      server.stop(true);
    }
  });

  test("check runs merge with commit statuses", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        if (req.url.includes("/check-runs")) {
          return new Response(
            JSON.stringify({
              total_count: 2,
              check_runs: [
                { status: "completed", conclusion: "success" },
                { status: "completed", conclusion: "failure" },
              ],
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ state: "success", statuses: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    try {
      const summary = await fetchCheckSummary("token", {
        owner: "acme",
        repo: "web",
        sha: "abc123",
        apiBase: `http://localhost:${server.port}`,
      });
      expect(summary).toEqual({ state: "failure", passing: 1, total: 2 });
    } finally {
      server.stop(true);
    }
  });
});

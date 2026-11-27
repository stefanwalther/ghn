import { describe, expect, test, vi } from "vitest";
import {
  buildSubjectStateBatches,
  fetchSubjectStatesBatch,
  parseSubjectRef,
  type SubjectRef,
} from "@/lib/subject-states";

/**
 * Pure contract tests for subject-reference parsing, batch packing bounds,
 * and the GraphQL HTTP boundary. End-to-end sync behavior (DB writes,
 * localUnread preservation, 404/403 thread handling, overlap, and scale) is
 * tested through `POST /api/sync` and `GET /api/notifications` in
 * `tests/integration/sync-route.test.ts` and `sync-performance.test.ts`.
 */

describe("parseSubjectRef", () => {
  test("parses GitHub pull request and issue URLs including custom hosts", () => {
    expect(
      parseSubjectRef({
        id: "1",
        subjectType: "PullRequest",
        sourceUrl: "https://github.com/acme/web/pull/42#discussion",
      })
    ).toEqual({
      id: "1",
      owner: "acme",
      repo: "web",
      kind: "PullRequest",
      number: 42,
    });
    expect(
      parseSubjectRef({
        id: "2",
        subjectType: "Issue",
        sourceUrl: "https://github.enterprise.local/org/repo/issues/9/",
      })
    ).toEqual({
      id: "2",
      owner: "org",
      repo: "repo",
      kind: "Issue",
      number: 9,
    });
  });

  test.each([
    { id: "1", subjectType: "CheckSuite", sourceUrl: "https://github.com/acme/web/pull/1" },
    { id: "2", subjectType: null, sourceUrl: "https://github.com/acme/web/pull/1" },
    { id: "3", subjectType: "PullRequest", sourceUrl: "" },
    { id: "4", subjectType: "PullRequest", sourceUrl: "not-a-url" },
    { id: "5", subjectType: "PullRequest", sourceUrl: "ftp://github.com/acme/web/pull/1" },
    { id: "6", subjectType: "PullRequest", sourceUrl: "https://github.com/acme/web" },
    { id: "7", subjectType: "PullRequest", sourceUrl: "https://github.com/acme/web/issues/1" },
    { id: "8", subjectType: "Issue", sourceUrl: "https://github.com/acme/web/pull/1" },
    { id: "9", subjectType: "PullRequest", sourceUrl: "https://github.com/acme/web/pull/0" },
  ])("returns null for non-matching row %j", (row) => {
    expect(parseSubjectRef(row)).toBeNull();
  });
});

describe("buildSubjectStateBatches", () => {
  test("returns an empty array for empty input", () => {
    expect(buildSubjectStateBatches([])).toEqual([]);
  });

  test("groups refs by repository case-insensitively without dropping or duplicating items", () => {
    const refs: SubjectRef[] = [
      { id: "1", owner: "Acme", repo: "Web", kind: "PullRequest", number: 11 },
      { id: "2", owner: "acme", repo: "web", kind: "Issue", number: 4 },
      { id: "3", owner: "other", repo: "api", kind: "PullRequest", number: 7 },
    ];
    const batches = buildSubjectStateBatches(refs);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.repos).toHaveLength(2);
    const ids = batches.flatMap((b) => b.repos.flatMap((r) => r.items.map((i) => i.id))).sort();
    expect(ids).toEqual(["1", "2", "3"]);
  });

  test("balances repositories across bins while honoring maxSubjects and maxRepos bounds", () => {
    const refs: SubjectRef[] = [];
    for (let r = 0; r < 10; r += 1) {
      const count = r < 2 ? 3 : 1;
      for (let j = 0; j < count; j += 1) {
        refs.push({
          id: `${r}_${j}`,
          owner: "org",
          repo: `repo-${r}`,
          kind: "PullRequest",
          number: j + 1,
        });
      }
    }
    const batches = buildSubjectStateBatches(refs, { maxSubjects: 6, maxRepos: 4 });
    const allIds = batches.flatMap((b) => b.repos.flatMap((r) => r.items.map((i) => i.id))).sort();
    expect(allIds).toEqual(refs.map((r) => r.id).sort());
    for (const batch of batches) {
      expect(batch.repos.length).toBeLessThanOrEqual(4);
      const count = batch.repos.reduce((n, r) => n + r.items.length, 0);
      expect(count).toBeLessThanOrEqual(6);
    }
    // Repo counts are balanced across bins (3, 3, 4) rather than piled into one tail bin.
    const repoCounts = batches.map((b) => b.repos.length);
    expect(Math.max(...repoCounts) - Math.min(...repoCounts)).toBeLessThanOrEqual(1);
  });

  test("opens an extra bin when a repo slice cannot fit into the initial minimum bins", () => {
    const refs: SubjectRef[] = [
      { id: "a1", owner: "org", repo: "r1", kind: "PullRequest", number: 1 },
      { id: "a2", owner: "org", repo: "r1", kind: "PullRequest", number: 2 },
      { id: "b1", owner: "org", repo: "r2", kind: "PullRequest", number: 1 },
      { id: "b2", owner: "org", repo: "r2", kind: "PullRequest", number: 2 },
      { id: "c1", owner: "org", repo: "r3", kind: "PullRequest", number: 1 },
      { id: "c2", owner: "org", repo: "r3", kind: "PullRequest", number: 2 },
    ];
    // 6 subjects with maxSubjects=3 gives minBins=2, but three 2-item repo slices need 3 bins.
    const batches = buildSubjectStateBatches(refs, { maxSubjects: 3, maxRepos: 4 });
    expect(batches).toHaveLength(3);
    expect(
      batches.flatMap((b) => b.repos.flatMap((r) => r.items.map((i) => i.id))).sort()
    ).toEqual(["a1", "a2", "b1", "b2", "c1", "c2"]);
  });
});

describe("fetchSubjectStatesBatch HTTP boundary", () => {
  const sampleBatch = buildSubjectStateBatches([
    { id: "pr_merged", owner: "acme", repo: "web", kind: "PullRequest", number: 1 },
    { id: "pr_closed", owner: "acme", repo: "web", kind: "PullRequest", number: 2 },
    { id: "pr_open", owner: "acme", repo: "web", kind: "PullRequest", number: 3 },
    { id: "pr_unknown", owner: "acme", repo: "web", kind: "PullRequest", number: 4 },
    { id: "iss_open", owner: "acme", repo: "web", kind: "Issue", number: 5 },
    { id: "iss_closed", owner: "acme", repo: "web", kind: "Issue", number: 6 },
    { id: "iss_unknown", owner: "acme", repo: "web", kind: "Issue", number: 7 },
    { id: "missing_repo", owner: "gone", repo: "repo", kind: "PullRequest", number: 8 },
  ])[0]!;

  test("normalizes PR and Issue states while tolerating partial errors and null nodes", async () => {
    const acmeRepo = sampleBatch.repos.find((r) => r.owner === "acme")!;
    const goneRepo = sampleBatch.repos.find((r) => r.owner === "gone")!;
    const aliasFor = (id: string) => acmeRepo.items.find((i) => i.id === id)!.alias;

    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            [acmeRepo.alias]: {
              [aliasFor("pr_merged")]: { state: "MERGED", merged: true },
              [aliasFor("pr_closed")]: { state: "CLOSED", merged: false },
              [aliasFor("pr_open")]: { state: "OPEN", merged: false },
              [aliasFor("pr_unknown")]: { state: "WEIRD", merged: false },
              [aliasFor("iss_open")]: { state: "OPEN" },
              [aliasFor("iss_closed")]: { state: "CLOSED" },
              [aliasFor("iss_unknown")]: { state: "UNKNOWN" },
            },
            [goneRepo.alias]: null,
          },
          errors: [{ type: "NOT_FOUND", path: [goneRepo.alias], message: "missing" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    const map = await fetchSubjectStatesBatch("tok", sampleBatch, fakeFetch);
    expect(map.get("pr_merged")).toEqual({ state: "closed", merged: true });
    expect(map.get("pr_closed")).toEqual({ state: "closed", merged: false });
    expect(map.get("pr_open")).toEqual({ state: "open", merged: false });
    expect(map.has("pr_unknown")).toBe(false);
    expect(map.get("iss_open")).toEqual({ state: "open", merged: false });
    expect(map.get("iss_closed")).toEqual({ state: "closed", merged: false });
    expect(map.has("iss_unknown")).toBe(false);
    expect(map.has("missing_repo")).toBe(false);
  });

  test("returns an empty map on HTTP failure, missing data, or network error", async () => {
    const httpErr = vi.fn(async () => new Response("err", { status: 500 })) as unknown as typeof fetch;
    expect((await fetchSubjectStatesBatch("tok", sampleBatch, httpErr)).size).toBe(0);

    const noData = vi.fn(async () =>
      new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 })
    ) as unknown as typeof fetch;
    expect((await fetchSubjectStatesBatch("tok", sampleBatch, noData)).size).toBe(0);

    const netErr = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await fetchSubjectStatesBatch("tok", sampleBatch, netErr)).size).toBe(0);
  });
});

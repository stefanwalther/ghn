import { describe, expect, test } from "vitest";
import {
  buildSeedNotifications,
  buildSeedSubjects,
  FROZEN_EPOCH,
  seedSubjectPath,
} from "@/lib/seed-data";

const EPOCH = Date.parse(FROZEN_EPOCH);

describe("the seed subject paths", () => {
  // A pull request is served from the pulls endpoint.
  test("a pull request is served from the pulls endpoint", () => {
    const item = buildSeedNotifications(EPOCH).find((i) => i.subjectType === "PullRequest");
    expect(item).toBeDefined();
    if (!item) return;
    expect(seedSubjectPath(item)).toBe(
      `/repos/${item.repoFullName.split("/")[0]}/${item.repoFullName.split("/")[1]}/pulls/${item.number}`
    );
  });

  // An issue is served from the issues endpoint.
  test("an issue is served from the issues endpoint", () => {
    const item = buildSeedNotifications(EPOCH).find((i) => i.subjectType === "Issue");
    expect(item).toBeDefined();
    if (!item) return;
    expect(seedSubjectPath(item)).toBe(
      `/repos/${item.repoFullName.split("/")[0]}/${item.repoFullName.split("/")[1]}/issues/${item.number}`
    );
  });

  // Every item in a repository has its own number, so no two items share a
  // subject path.
  test("no two items share a subject path", () => {
    const paths = buildSeedNotifications(EPOCH).map((item) => seedSubjectPath(item));
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("the seed subject payloads", () => {
  // The stand-in serves one payload per item, so the payloads have to
  // cover every item.
  test("there is one payload per item", () => {
    const items = buildSeedNotifications(EPOCH);
    const subjects = buildSeedSubjects(EPOCH);
    expect(subjects.size).toBe(items.length);
  });

  // The payload carries the item's own state, because the sync path reads
  // the merged flag and the state out of it.
  test("the payload carries the item's own state and merged flag", () => {
    const items = buildSeedNotifications(EPOCH);
    const subjects = buildSeedSubjects(EPOCH);

    for (const item of items) {
      const payload = subjects.get(seedSubjectPath(item)) as {
        state: string;
        merged: boolean;
        title: string;
        html_url: string;
      };
      expect(payload.state).toBe(item.subjectState);
      expect(payload.merged).toBe(item.prMerged);
      expect(payload.title).toBe(item.subject);
      expect(payload.html_url).toBe(item.sourceUrl);
    }
  });

  // The payloads are keyed by the path the subject api url points at.
  test("the payloads are keyed by the subject path", () => {
    const subjects = buildSeedSubjects(EPOCH);
    expect(subjects.has("/repos/acme/web/pulls/1")).toBe(true);
  });
});

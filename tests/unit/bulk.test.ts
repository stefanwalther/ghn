import { describe, expect, test } from "vitest";
import { validateBulkInput, validateBulkRepoInput } from "@/lib/bulk";

describe("bulk validation", () => {
  test("rejects empty ids", () => {
    expect(validateBulkInput([], "done")).toEqual({ ok: false, status: 400 });
    expect(validateBulkInput([1, 2], "done")).toEqual({ ok: false, status: 400 });
  });

  test("rejects unknown action", () => {
    expect(validateBulkInput(["n_001"], "archive")).toEqual({ ok: false, status: 400 });
  });

  test("dedupes ids and accepts done", () => {
    expect(validateBulkInput(["n_001", "n_001", "n_002"], "done")).toEqual({
      ok: true,
      ids: ["n_001", "n_002"],
      action: "done",
    });
  });

  test("accepts unsubscribe and read", () => {
    expect(validateBulkInput(["n_005"], "unsubscribe")).toEqual({
      ok: true,
      ids: ["n_005"],
      action: "unsubscribe",
    });
    expect(validateBulkInput(["n_005"], "read")).toEqual({
      ok: true,
      ids: ["n_005"],
      action: "read",
    });
  });
  test("accepts unread for done-to-unread re-entry", () => {
    const result = validateBulkInput(["n_005"], "unread");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.action).toBe("unread");
  });
});

describe("bulk repo validation", () => {
  test("rejects empty repository ids and other actions", () => {
    expect(validateBulkRepoInput("", "done")).toEqual({ ok: false, status: 400 });
    expect(validateBulkRepoInput(null, "done")).toEqual({ ok: false, status: 400 });
    expect(validateBulkRepoInput("acme--web", "unsubscribe")).toEqual({
      ok: false,
      status: 400,
    });
    expect(validateBulkRepoInput("acme--web", "unread")).toEqual({
      ok: false,
      status: 400,
    });
  });

  test("accepts repo-wide done and read", () => {
    expect(validateBulkRepoInput("acme--web", "done")).toEqual({
      ok: true,
      repositoryId: "acme--web",
      action: "done",
    });
    expect(validateBulkRepoInput("acme--web", "read")).toEqual({
      ok: true,
      repositoryId: "acme--web",
      action: "read",
    });
  });
});

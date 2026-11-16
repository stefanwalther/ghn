import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { APP_VERSION, GITHUB_REPO_URL } from "@/lib/app-meta";
import {
  UPDATE_CACHE_TTL_MS,
  getUpdateInfo,
  resetUpdateCache,
} from "@/lib/update-check";
import { withEnv } from "../support/test-env";

let restoreEnv: (() => void) | null = null;

function stubFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(async () =>
    ok
      ? Response.json(payload)
      : new Response(JSON.stringify(payload), { status })
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  resetUpdateCache();
  restoreEnv?.();
  restoreEnv = withEnv({
    GHN_DISABLE_UPDATE_CHECK: undefined,
    GHN_RELEASES_API_BASE: "http://releases.local",
  });
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
  resetUpdateCache();
  vi.unstubAllGlobals();
});

describe("update check", () => {
  test("a newer tag reports an update with the release url", async () => {
    const info = await getUpdateInfo(
      stubFetch({ tag_name: "v9.9.9", html_url: "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9" }),
      Date.now()
    );
    expect(info.current).toBe(APP_VERSION);
    expect(info.latest).toBe("9.9.9");
    expect(info.updateAvailable).toBe(true);
    expect(info.releaseUrl).toContain("v9.9.9");
    // Extended shape backward compat: notes fields default to null when absent.
    expect(info.releaseName).toBeNull();
    expect(info.releaseBody).toBeNull();
    expect(info.publishedAt).toBeNull();
  });

  test("a release with notes projects name, body, and published date", async () => {
    const info = await getUpdateInfo(
      stubFetch({
        tag_name: "v9.9.9",
        html_url: "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9",
        name: "ghn-v9.9.9",
        body: "## Features\n\n* **inbox:** stuff\n",
        published_at: "2026-11-14T12:00:00Z",
      }),
      Date.now()
    );
    expect(info.latest).toBe("9.9.9");
    expect(info.updateAvailable).toBe(true);
    expect(info.releaseName).toBe("ghn-v9.9.9");
    expect(info.releaseBody).toBe("## Features\n\n* **inbox:** stuff\n");
    expect(info.publishedAt).toBe("2026-11-14T12:00:00Z");
  });

  test("empty or non-string notes coerce to null without hiding the update", async () => {
    const info = await getUpdateInfo(
      stubFetch({
        tag_name: "v9.9.9",
        html_url: "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9",
        name: "   ",
        body: "   \n  ",
        published_at: "not-a-date",
      }),
      Date.now()
    );
    // "`releaseName`: Null/empty coerces to null; dialog falls back to tag line"
    expect(info.releaseName).toBeNull();
    // "`releaseBody`: Null/undefined/whitespace-only coerces to null; null renders the empty state, never raw markup"
    expect(info.releaseBody).toBeNull();
    // "`publishedAt`: ISO string passthrough when parseable, else null"
    expect(info.publishedAt).toBeNull();
    // notes fields never force updateAvailable false on their own
    expect(info.latest).toBe("9.9.9");
    expect(info.updateAvailable).toBe(true);
  });

  test("published_at falls back to created_at", async () => {
    const info = await getUpdateInfo(
      stubFetch({
        tag_name: "v9.9.9",
        name: "r",
        body: "notes",
        created_at: "2026-11-13T10:00:00Z",
      }),
      Date.now()
    );
    expect(info.publishedAt).toBe("2026-11-13T10:00:00Z");
    expect(info.releaseName).toBe("r");
    expect(info.releaseBody).toBe("notes");
  });

  test("non-string notes fields coerce to null", async () => {
    const info = await getUpdateInfo(
      stubFetch({
        tag_name: "v9.9.9",
        name: 123,
        body: { text: "hi" },
        published_at: 12345,
      }),
      Date.now()
    );
    expect(info.releaseName).toBeNull();
    expect(info.releaseBody).toBeNull();
    expect(info.publishedAt).toBeNull();
    expect(info.updateAvailable).toBe(true);
  });

  test("the current tag reports no update", async () => {
    const info = await getUpdateInfo(
      stubFetch({ tag_name: `v${APP_VERSION}`, html_url: "https://example.com/r" }),
      Date.now()
    );
    expect(info.updateAvailable).toBe(false);
    expect(info.latest).toBe(APP_VERSION);
  });

  test("a failed release lookup stays quiet", async () => {
    const info = await getUpdateInfo(stubFetch({ error: "nope" }, false, 404), Date.now());
    expect(info.updateAvailable).toBe(false);
    expect(info.latest).toBeNull();
    expect(info.releaseUrl).toBe(`${GITHUB_REPO_URL}/releases`);
    expect(info.releaseName).toBeNull();
    expect(info.releaseBody).toBeNull();
    expect(info.publishedAt).toBeNull();
  });

  test("a network failure stays quiet", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const info = await getUpdateInfo(failing, Date.now());
    expect(info.updateAvailable).toBe(false);
    expect(info.latest).toBeNull();
    expect(info.releaseName).toBeNull();
    expect(info.releaseBody).toBeNull();
    expect(info.publishedAt).toBeNull();
  });

  test("the second check within the ttl reuses the cache", async () => {
    const fetchMock = stubFetch({ tag_name: "v9.9.9" });
    const now = Date.now();
    await getUpdateInfo(fetchMock, now);
    await getUpdateInfo(fetchMock, now + 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("the cache expires after the ttl", async () => {
    const fetchMock = stubFetch({ tag_name: "v9.9.9" });
    const now = Date.now();
    await getUpdateInfo(fetchMock, now);
    await getUpdateInfo(fetchMock, now + UPDATE_CACHE_TTL_MS + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("the check can be switched off", async () => {
    restoreEnv?.();
    restoreEnv = withEnv({
      GHN_DISABLE_UPDATE_CHECK: "1",
      GHN_RELEASES_API_BASE: "http://releases.local",
    });
    const fetchMock = stubFetch({ tag_name: "v9.9.9" });
    const info = await getUpdateInfo(fetchMock, Date.now());
    expect(info.updateAvailable).toBe(false);
    expect(info.releaseName).toBeNull();
    expect(info.releaseBody).toBeNull();
    expect(info.publishedAt).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

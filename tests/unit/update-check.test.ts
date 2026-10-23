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
  });

  test("a network failure stays quiet", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const info = await getUpdateInfo(failing, Date.now());
    expect(info.updateAvailable).toBe(false);
    expect(info.latest).toBeNull();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

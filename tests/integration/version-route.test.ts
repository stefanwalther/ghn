import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { startGitHubStandIn, type StandIn } from "../support/github-stand-in";
import { withEnv } from "../support/test-env";
import { resetUpdateCache } from "@/lib/update-check";

const TOKEN = "test-token";

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

function useEnv(vars: Record<string, string | undefined>): void {
  restoreEnv?.();
  restoreEnv = withEnv(vars);
}

beforeAll(async () => {
  standIn = await startGitHubStandIn({ token: TOKEN });
});

afterAll(async () => {
  await standIn.close();
});

beforeEach(() => {
  standIn.reset();
  resetUpdateCache();
  useEnv({
    GHN_TOKEN: TOKEN,
    GHN_API_BASE: standIn.url,
    GHN_RELEASES_API_BASE: standIn.url,
    GHN_DISABLE_UPDATE_CHECK: undefined,
  });
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
  resetUpdateCache();
});

async function version(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/version/route");
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("GET /api/version", () => {
  test("a newer release reports an update", async () => {
    standIn.setScenario("/repos/stefanwalther/ghn/releases/latest", {
      status: 200,
      body: {
        tag_name: "v9.9.9",
        html_url: "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9",
      },
    });
    const { status, body } = await version();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      latest: "9.9.9",
      updateAvailable: true,
    });
    expect(typeof body.current).toBe("string");
    expect(typeof body.releaseUrl).toBe("string");
    // Backward compat: absent notes coerce to null.
    expect(body.releaseName).toBeNull();
    expect(body.releaseBody).toBeNull();
    expect(body.publishedAt).toBeNull();
  });

  test("a release with notes projects the success variant", async () => {
    standIn.setScenario("/repos/stefanwalther/ghn/releases/latest", {
      status: 200,
      body: {
        tag_name: "v9.9.9",
        html_url: "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9",
        name: "ghn-v9.9.9",
        body: "## Features\n\n* **inbox:** stuff\n",
        published_at: "2026-11-14T12:00:00Z",
      },
    });
    const { status, body } = await version();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      latest: "9.9.9",
      updateAvailable: true,
      releaseName: "ghn-v9.9.9",
      releaseBody: "## Features\n\n* **inbox:** stuff\n",
      publishedAt: "2026-11-14T12:00:00Z",
    });
  });

  test("empty notes coerce to null but keep the update", async () => {
    standIn.setScenario("/repos/stefanwalther/ghn/releases/latest", {
      status: 200,
      body: {
        tag_name: "v9.9.9",
        html_url: "https://github.com/stefanwalther/ghn/releases/tag/v9.9.9",
        name: "   ",
        body: "   ",
        published_at: "not-a-date",
      },
    });
    const { body } = await version();
    expect(body).toMatchObject({
      latest: "9.9.9",
      updateAvailable: true,
      releaseName: null,
      releaseBody: null,
      publishedAt: null,
    });
  });

  test("without releases the route stays quiet", async () => {
    standIn.setScenario("/repos/stefanwalther/ghn/releases/latest", { status: 404 });
    const { body } = await version();
    expect(body).toMatchObject({
      updateAvailable: false,
      latest: null,
      releaseName: null,
      releaseBody: null,
      publishedAt: null,
    });
  });

  test("the disabled check never contacts the release endpoint", async () => {
    useEnv({
      GHN_TOKEN: TOKEN,
      GHN_API_BASE: standIn.url,
      GHN_RELEASES_API_BASE: standIn.url,
      GHN_DISABLE_UPDATE_CHECK: "1",
    });
    const { body } = await version();
    expect(body).toMatchObject({ updateAvailable: false });
    expect(body.releaseName).toBeNull();
    expect(body.releaseBody).toBeNull();
    expect(body.publishedAt).toBeNull();
    expect(standIn.requests).toHaveLength(0);
  });
});

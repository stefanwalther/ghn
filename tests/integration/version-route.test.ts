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
  });

  test("without releases the route stays quiet", async () => {
    standIn.setScenario("/repos/stefanwalther/ghn/releases/latest", { status: 404 });
    const { body } = await version();
    expect(body).toMatchObject({ updateAvailable: false, latest: null });
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
    expect(standIn.requests).toHaveLength(0);
  });
});

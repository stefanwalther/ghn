import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { startGitHubStandIn, type StandIn } from "../support/github-stand-in";
import { withEnv } from "../support/test-env";

/**
 * The `bun` shell is the only way to reach the local `gh` CLI, so it is
 * mocked here and the check asserts on the scripted answer instead of the
 * maintainer's real GitHub login.
 */
vi.mock("bun", () => {
  const shell = () => ({
    quiet() {
      return this;
    },
    nothrow() {
      return this;
    },
    exitCode: 0,
    text() {
      return "github.com\n  ✓ Logged in to github.com account test-user (keyring)\n";
    },
  });
  return { $: shell };
});

const TOKEN = "test-token";
const DB_PATH = "/tmp/ghn-settings-test/ghn.db";

let standIn: StandIn;
let restoreEnv: (() => void) | null = null;

async function settings(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/settings/route");
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

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
});

afterEach(() => {
  restoreEnv?.();
  restoreEnv = null;
});

describe("GET /api/settings", () => {
  test("a working credential reports the database paths and the auth state", async () => {
    useEnv({ GHN_TOKEN: TOKEN, GHN_API_BASE: standIn.url, GHN_DB_PATH: DB_PATH });
    const { status, body } = await settings();
    expect(status).toBe(200);
    const database = body.database as Record<string, unknown>;
    expect(database.databasePath).toBe(DB_PATH);
    expect(typeof database.configPath).toBe("string");
    const github = body.github as Record<string, unknown>;
    expect(github).toMatchObject({
      connected: true,
      viewerLogin: "test-user",
      tokenPresent: true,
      tokenSource: "GHN_TOKEN",
      ghCliAuthenticated: true,
    });
    expect(github.ghCliDetail).toContain("test-user");
  });

  test("a GH_TOKEN credential names its source", async () => {
    useEnv({
      GHN_TOKEN: undefined,
      GH_TOKEN: TOKEN,
      GITHUB_TOKEN: undefined,
      GHN_API_BASE: standIn.url,
      GHN_DB_PATH: DB_PATH,
    });
    const { body } = await settings();
    const github = body.github as Record<string, unknown>;
    expect(github).toMatchObject({
      connected: true,
      tokenPresent: true,
      tokenSource: "GH_TOKEN",
    });
  });

  test("an explicitly disabled token reports no credential without network or gh", async () => {
    useEnv({ GHN_TOKEN: "", GHN_API_BASE: standIn.url, GHN_DB_PATH: DB_PATH });
    const { status, body } = await settings();
    expect(status).toBe(200);
    const github = body.github as Record<string, unknown>;
    expect(github).toMatchObject({
      connected: false,
      reason: "auth",
      tokenPresent: false,
      tokenSource: "none",
      ghCliAuthenticated: false,
    });
    expect(github.ghCliDetail).toContain("disabled");
    expect(standIn.requests).toHaveLength(0);
  });
});

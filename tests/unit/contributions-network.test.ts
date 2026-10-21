import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  fetchDayCount,
  getViewerLogin,
  resolveLogin,
  todayUTC,
} from "@/lib/contributions";

const ENV_KEYS = ["GHN_TOKEN", "GHN_API_BASE", "GHN_NOW"] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function recordFetch(
  responder: (call: FetchCall) => Response | Promise<Response>
): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fake = async (input: unknown, init?: { method?: string; headers?: unknown; body?: unknown }) => {
    const headers: Record<string, string> = {};
    const raw = init?.headers;
    if (raw && typeof raw === "object") {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        headers[key] = String(value);
      }
    }
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    return responder(call);
  };
  vi.stubGlobal("fetch", fake);
  return { calls };
}

describe("resolveLogin", () => {
  // The configured login wins, because it is the one the user chose.
  test("the configured login wins over the viewer's", () => {
    expect(resolveLogin("me", "them")).toBe("me");
  });

  // Without a configured login the viewer's own login is the one to use.
  test("the viewer is used when there is no configured login", () => {
    expect(resolveLogin(undefined, "them")).toBe("them");
  });

  // An empty configured login is not a login, so the viewer takes over.
  test("an empty configured login falls back to the viewer", () => {
    expect(resolveLogin("", "them")).toBe("them");
  });

  // With neither there is no account to read contributions for.
  test("no login at all yields null", () => {
    expect(resolveLogin(undefined, null)).toBeNull();
    expect(resolveLogin("", null)).toBeNull();
  });
});

describe("todayUTC", () => {
  // The day is the UTC calendar day of the pinned clock, not the local one.
  test("the pinned clock decides the day", () => {
    process.env.GHN_NOW = String(Date.parse("2026-01-15T12:00:00Z"));
    expect(todayUTC()).toBe("2026-01-15");
  });

  // A pinned instant just after midnight UTC is still that UTC day.
  test("an instant just after midnight UTC is the same day", () => {
    process.env.GHN_NOW = String(Date.parse("2026-03-01T00:30:00Z"));
    expect(todayUTC()).toBe("2026-03-01");
  });

  // The day rolls over at midnight UTC, so the last millisecond of a day
  // and the first of the next are on different days.
  test("the day rolls over at midnight UTC", () => {
    process.env.GHN_NOW = String(Date.parse("2026-03-01T23:59:59.999Z"));
    expect(todayUTC()).toBe("2026-03-01");
    process.env.GHN_NOW = String(Date.parse("2026-03-02T00:00:00.000Z"));
    expect(todayUTC()).toBe("2026-03-02");
  });
});

describe("getViewerLogin", () => {
  // Without a credential there is no viewer, and no request is made.
  test("without a token the viewer is unknown and nothing is requested", async () => {
    process.env.GHN_TOKEN = "";
    const { calls } = recordFetch(() => new Response("{}"));
    await expect(getViewerLogin()).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  // The credential is presented as a bearer token, with the API version
  // header GitHub requires.
  test("the token is presented as a bearer credential", async () => {
    process.env.GHN_TOKEN = "secret-token";
    process.env.GHN_API_BASE = "https://api.example.test";
    const { calls } = recordFetch(
      () => new Response(JSON.stringify({ login: "octo" }))
    );

    await expect(getViewerLogin("secret-token")).resolves.toBe("octo");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.test/user");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer secret-token",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  });

  // A rejected request means the viewer is unknown, not an error.
  test("a rejected request yields no viewer", async () => {
    process.env.GHN_TOKEN = "secret-token";
    recordFetch(() => new Response("{}", { status: 401 }));
    await expect(getViewerLogin("test-token")).resolves.toBeNull();
  });

  // A payload without a login field carries no viewer.
  test("a payload without a login yields no viewer", async () => {
    process.env.GHN_TOKEN = "secret-token";
    recordFetch(() => new Response(JSON.stringify({ id: 1 })));
    await expect(getViewerLogin("test-token")).resolves.toBeNull();
  });

  // A network failure means no viewer either.
  test("a network failure yields no viewer", async () => {
    process.env.GHN_TOKEN = "secret-token";
    recordFetch(() => {
      throw new Error("connection refused");
    });
    await expect(getViewerLogin("test-token")).resolves.toBeNull();
  });
});

describe("fetchDayCount", () => {
  const PAYLOAD = {
    data: {
      user: {
        contributionsCollection: {
          contributionCalendar: {
            weeks: [
              {
                contributionDays: [
                  { date: "2026-01-14", contributionCount: 4 },
                  { date: "2026-01-15", contributionCount: 12 },
                ],
              },
            ],
          },
        },
      },
    },
  };

  // Without a credential the count is unknown and nothing is requested.
  test("without a token the count is unknown and nothing is requested", async () => {
    process.env.GHN_TOKEN = "";
    const { calls } = recordFetch(() => new Response("{}"));
    await expect(fetchDayCount("octo", "2026-01-15")).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  // The query is posted to the GraphQL endpoint, with the login and the
  // whole day as the variables.
  test("the query carries the login and the day window", async () => {
    process.env.GHN_TOKEN = "secret-token";
    process.env.GHN_API_BASE = "https://api.example.test";
    const { calls } = recordFetch(() => new Response(JSON.stringify(PAYLOAD)));

    await fetchDayCount("octo", "2026-01-15", "secret-token");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.test/graphql");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers).toEqual({
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      Authorization: "Bearer secret-token",
      "X-GitHub-Api-Version": "2022-11-28",
    });

    const body = JSON.parse(calls[0]?.body ?? "{}") as {
      query: string;
      variables: { login: string; from: string; to: string };
    };
    expect(body.query).toContain("contributionsCollection");
    expect(body.variables).toEqual({
      login: "octo",
      from: "2026-01-15T00:00:00Z",
      to: "2026-01-15T23:59:59Z",
    });
  });

  // The count is the one the payload reports for the requested day.
  test("the count comes from the requested day in the payload", async () => {
    process.env.GHN_TOKEN = "secret-token";
    recordFetch(() => new Response(JSON.stringify(PAYLOAD)));
    await expect(fetchDayCount("octo", "2026-01-15", "secret-token")).resolves.toBe(12);
  });

  // A payload without the requested day has no count for it.
  test("a payload without the requested day yields no count", async () => {
    process.env.GHN_TOKEN = "secret-token";
    recordFetch(() => new Response(JSON.stringify(PAYLOAD)));
    await expect(fetchDayCount("octo", "2026-01-16", "secret-token")).resolves.toBeNull();
  });

  // A rejected request means the count is unknown.
  test("a rejected request yields no count", async () => {
    process.env.GHN_TOKEN = "secret-token";
    recordFetch(() => new Response("{}", { status: 500 }));
    await expect(fetchDayCount("octo", "2026-01-15", "secret-token")).resolves.toBeNull();
  });

  // A network failure means the count is unknown.
  test("a network failure yields no count", async () => {
    process.env.GHN_TOKEN = "secret-token";
    recordFetch(() => {
      throw new Error("connection refused");
    });
    await expect(fetchDayCount("octo", "2026-01-15", "secret-token")).resolves.toBeNull();
  });
});

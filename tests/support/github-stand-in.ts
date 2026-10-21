import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface StandInThread {
  id: string;
  unread: boolean;
  reason: string;
  updated_at: string;
  subject: { title: string; type: string; url: string };
  repository: { full_name: string; html_url: string; owner: { login: string } };
  url: string;
}

export interface Scenario {
  status: number;
  body?: unknown;
  delayMs?: number;
  rateLimitRemaining?: number;
}

export interface StandInOptions {
  port?: number;
  token?: string;
  viewerLogin?: string;
  threads?: StandInThread[];
  perPage?: number;
  rateLimit?: { limit: number; used: number; remaining: number; reset: number };
}

export interface StandInRequest {
  method: string;
  path: string;
  authorization?: string;
  body?: string;
}

export interface StandIn {
  url: string;
  port: number;
  requests: StandInRequest[];
  setThreads(threads: StandInThread[]): void;
  setSubject(path: string, payload: unknown): void;
  setScenario(path: string, scenario: Scenario | null): void;
  setRateLimit(limit: number, used: number, remaining: number, reset: number): void;
  reset(): void;
  close(): Promise<void>;
}

const DEFAULT_RATE_LIMIT = { limit: 5000, used: 1234, remaining: 3766, reset: 0 };

/**
 * A controllable local substitute for the GitHub API.
 *
 * The test suite never contacts the real service. This stand-in answers every
 * endpoint the application calls, and can be scripted to produce the failure
 * modes the application has to handle: success, unauthorized, rate limited,
 * forbidden, not found, server error and timeout.
 *
 * The same module is used two ways: in-process by the integration layer, and
 * as a standalone process by the end-to-end layer. One scripted behaviour,
 * two layers, so they cannot drift apart.
 */
export async function startGitHubStandIn(
  options: StandInOptions = {}
): Promise<StandIn> {
  const token = options.token ?? "test-token";
  const viewerLogin = options.viewerLogin ?? "test-user";
  const perPage = options.perPage ?? 50;

  let threads: StandInThread[] = options.threads ?? [];
  let rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const scenarios = new Map<string, Scenario>();
  const subjects = new Map<string, unknown>();
  const requests: StandInRequest[] = [];

  function rateLimitHeaders(override?: number): Record<string, string> {
    return {
      "x-ratelimit-limit": String(rateLimit.limit),
      "x-ratelimit-used": String(rateLimit.used),
      "x-ratelimit-remaining": String(override ?? rateLimit.remaining),
      "x-ratelimit-reset": String(rateLimit.reset),
    };
  }

  function findScenario(path: string): Scenario | undefined {
    if (scenarios.has(path)) return scenarios.get(path);
    for (const [pattern, scenario] of scenarios) {
      if (pattern.endsWith("*") && path.startsWith(pattern.slice(0, -1))) {
        return scenario;
      }
    }
    return undefined;
  }

  function defaultSubject(path: string): unknown {
    if (subjects.has(path)) return subjects.get(path);
    const match = path.match(/^\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)/);
    const [, owner, repo, kind, number] = match ?? [];
    // The API path says "pulls", the web path says "pull". GitHub uses the
    // short form, and so does the application when it turns a web url back
    // into an API url.
    const webKind = kind === "issues" ? "issues" : "pull";
    return {
      title: "Fix flaky login redirect",
      body: "The redirect races the session load.",
      state: "open",
      draft: false,
      merged: false,
      user: { login: viewerLogin },
      html_url: `https://github.com/${owner ?? "acme"}/${repo ?? "web"}/${webKind}/${number ?? "1"}`,
      head: { sha: "0123456789abcdef0123456789abcdef01234567" },
    };
  }

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      void (async () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const host = req.headers.host ?? "127.0.0.1";
        const url = new URL(req.url ?? "/", `http://${host}`);
        const path = url.pathname;
        const method = req.method ?? "GET";

        requests.push({
          method,
          path,
          authorization: req.headers.authorization,
          body: body || undefined,
        });

        const reply = (status: number, payload: unknown, extra?: Record<string, string>) => {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...rateLimitHeaders(),
            ...extra,
          };
          res.writeHead(status, headers);
          res.end(payload === undefined ? "" : JSON.stringify(payload));
        };

        // The health probe is unauthenticated so the runner can wait for it.
        if (path === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // Everything else needs the expected credential. A mismatch is how
        // the authorization failure path gets exercised.
        const authorization = req.headers.authorization;
        if (authorization !== `Bearer ${token}`) {
          reply(401, { error: "Bad credentials" });
          return;
        }

        const scenario = findScenario(path);
        if (scenario) {
          if (scenario.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, scenario.delayMs));
          }
          const extra =
            scenario.rateLimitRemaining === undefined
              ? undefined
              : { "x-ratelimit-remaining": String(scenario.rateLimitRemaining) };
          reply(scenario.status, scenario.body ?? { error: "scripted" }, extra);
          return;
        }

        if (path === "/user") {
          reply(200, { login: viewerLogin });
          return;
        }

        if (path === "/notifications" && method === "GET") {
          const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
          const start = (page - 1) * perPage;
          const slice = threads.slice(start, start + perPage);
          const hasMore = start + perPage < threads.length;
          // The pagination link must carry the port, otherwise the follow-up
          // request goes to port 80 and fails as a network error.
          const link = hasMore
            ? `<http://${host}/notifications?all=true&per_page=${perPage}&page=${page + 1}>; rel="next"`
            : undefined;
          reply(200, slice, {
            "last-modified": "Fri, 16 Oct 2026 15:33:32 GMT",
            "x-poll-interval": "60",
            ...(link ? { link } : {}),
          });
          return;
        }

        const threadMatch = path.match(/^\/notifications\/threads\/([^/]+)$/);
        if (threadMatch) {
          const id = threadMatch[1];
          if (method === "GET") {
            const found = threads.find((thread) => thread.id === id);
            if (!found) {
              reply(404, { error: "Not Found" });
              return;
            }
            reply(200, found);
            return;
          }
          if (method === "PATCH" || method === "DELETE") {
            reply(205, undefined);
            return;
          }
        }

        const subscriptionMatch = path.match(
          /^\/notifications\/threads\/([^/]+)\/subscription$/
        );
        if (subscriptionMatch && method === "PUT") {
          reply(200, { ignored: true });
          return;
        }

        if (path === "/search/repositories") {
          reply(200, { total_count: 0, items: [] });
          return;
        }

        if (path === "/graphql" && method === "POST") {
          const requested = safeParse(body);
          const variables = (requested as { variables?: { login?: string; from?: string; to?: string } })
            ?.variables;
          if (variables?.from && variables?.to) {
            reply(200, {
              data: {
                user: {
                  contributionsCollection: {
                    contributionCalendar: {
                      weeks: [
                        {
                          contributionDays: [
                            { date: variables.from.slice(0, 10), contributionCount: 7 },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            });
            return;
          }
          reply(200, { data: { viewer: { login: viewerLogin } } });
          return;
        }

        const repoMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)$/);
        if (repoMatch) {
          reply(200, {
            name: repoMatch[2],
            full_name: `${repoMatch[1]}/${repoMatch[2]}`,
            owner: { login: repoMatch[1] },
          });
          return;
        }

        const commentsMatch = path.match(
          /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/
        );
        if (commentsMatch) {
          reply(200, [
            {
              user: { login: "octo" },
              body: "Looks good to me.",
              created_at: "2026-01-15T10:00:00Z",
            },
          ]);
          return;
        }

        const runsMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/runs$/);
        if (runsMatch) {
          reply(200, {
            workflow_runs: [
              {
                name: "CI",
                html_url: "https://github.com/acme/web/actions/runs/1",
                status: "completed",
                conclusion: "success",
                head_branch: "main",
                created_at: "2026-01-15T09:00:00Z",
              },
            ],
          });
          return;
        }

        const statusMatch = path.match(
          /^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)\/status$/
        );
        if (statusMatch) {
          reply(200, { statuses: [{ state: "success" }] });
          return;
        }

        const checkRunsMatch = path.match(
          /^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)\/check-runs$/
        );
        if (checkRunsMatch) {
          reply(200, { check_runs: [{ status: "completed", conclusion: "success" }] });
          return;
        }

        const subjectMatch = path.match(
          /^\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)/
        );
        if (subjectMatch) {
          reply(200, defaultSubject(path));
          return;
        }

        reply(404, { error: "Not Found" });
      })();
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, "127.0.0.1", resolve)
  );
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests,
    setThreads(next: StandInThread[]) {
      threads = next;
    },
    setSubject(path: string, payload: unknown) {
      subjects.set(path, payload);
    },
    setScenario(path: string, scenario: Scenario | null) {
      if (scenario === null) scenarios.delete(path);
      else scenarios.set(path, scenario);
    },
    setRateLimit(limit: number, used: number, remaining: number, reset: number) {
      rateLimit = { limit, used, remaining, reset };
    },
    reset() {
      threads = options.threads ?? [];
      rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
      scenarios.clear();
      subjects.clear();
      requests.length = 0;
    },
    close: async () => {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function safeParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

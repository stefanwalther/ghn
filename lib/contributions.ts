import { apiBases, tokenDisabled } from "@/lib/github";
import { nowMs } from "@/lib/clock";

const QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

export function dayWindowUTC(date: string): { from: string; to: string } {
  return { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` };
}

export function isValidDay(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
}

export function todayUTC(): string {
  return new Date(nowMs()).toISOString().slice(0, 10);
}

export function lastNDates(today: string, n: number): string[] {
  const dates: string[] = [];
  const base = Date.parse(`${today}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    dates.push(new Date(base - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }
  return dates;
}

export function rangeWindowUTC(from: string, to: string): { from: string; to: string } {
  return { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` };
}

export function isFresh(
  fetchedAt: number,
  now: number,
  date: string,
  today: string,
  ttlMs = 5 * 60 * 1000
): boolean {
  if (date !== today) return true;
  return now - fetchedAt < ttlMs;
}

interface CalendarDay {
  date?: unknown;
  contributionCount?: unknown;
}

async function fetchViewerLogin(token: string): Promise<string | null> {
  try {
    const { restBase } = apiBases();
    const res = await fetch(`${restBase}/user`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { login?: unknown };
    return typeof payload.login === "string" && payload.login ? payload.login : null;
  } catch {
    return null;
  }
}

export function pickDay(payload: unknown, date: string): number | null {
  return pickRange(payload)[date] ?? null;
}

export function pickRange(payload: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const weeks = (payload as { data?: { user?: { contributionsCollection?: { contributionCalendar?: { weeks?: { contributionDays?: CalendarDay[] }[] } } } } })
    ?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) return out;
  for (const week of weeks) {
    const days = week?.contributionDays;
    if (!Array.isArray(days)) continue;
    for (const day of days) {
      if (typeof day?.date === "string" && typeof day?.contributionCount === "number") {
        out[day.date] = day.contributionCount;
      }
    }
  }
  return out;
}

export async function getViewerLogin(token?: string | null): Promise<string | null> {
  if (token) return fetchViewerLogin(token);
  // The environment switched the credential off, so the local helper must
  // not be used to find one.
  if (tokenDisabled()) return null;
  try {
    const { $ } = await import("bun");
    const out = await $`gh api user --jq .login`.quiet().text();
    const login = out.trim();
    return login || null;
  } catch {
    return null;
  }
}

export async function fetchDayCount(
  login: string,
  date: string,
  token?: string | null
): Promise<number | null> {
  const range = await fetchRangeCounts(login, date, date, token);
  return range?.[date] ?? null;
}

export async function fetchRangeCounts(
  login: string,
  fromDate: string,
  toDate: string,
  token?: string | null
): Promise<Record<string, number> | null> {
  const { from, to } = rangeWindowUTC(fromDate, toDate);
  if (token) {
    try {
      const { graphqlUrl } = apiBases();
      const res = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ query: QUERY, variables: { login, from, to } }),
      });
      if (!res.ok) return null;
      return pickRange(await res.json());
    } catch {
      return null;
    }
  }
  if (tokenDisabled()) return null;
  try {
    const { $ } = await import("bun");
    const proc = await $`gh api graphql -f query=${QUERY} -f login=${login} -f from=${from} -f to=${to}`.quiet().nothrow();
    if (proc.exitCode !== 0) return null;
    const payload = JSON.parse(proc.text());
    return pickRange(payload);
  } catch {
    return null;
  }
}

export function resolveLogin(envLogin: string | undefined, viewer: string | null): string | null {
  return envLogin || viewer;
}

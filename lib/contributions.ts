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
  return new Date().toISOString().slice(0, 10);
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

import { apiBases } from "@/lib/github";

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

async function fetchDayCountViaApi(token: string, login: string, date: string): Promise<number | null> {
  const { from, to } = dayWindowUTC(date);
  try {
    const { graphqlUrl } = apiBases();
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY, variables: { login, from, to } }),
    });
    if (!res.ok) return null;
    return pickDay(await res.json(), date);
  } catch {
    return null;
  }
}

export function pickDay(payload: unknown, date: string): number | null {
  const weeks = (payload as { data?: { user?: { contributionsCollection?: { contributionCalendar?: { weeks?: { contributionDays?: CalendarDay[] }[] } } } } })
    ?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) return null;
  for (const week of weeks) {
    const days = week?.contributionDays;
    if (!Array.isArray(days)) continue;
    for (const day of days) {
      if (day?.date === date && typeof day?.contributionCount === "number") {
        return day.contributionCount;
      }
    }
  }
  return null;
}

export async function getViewerLogin(token?: string | null): Promise<string | null> {
  if (token) return fetchViewerLogin(token);
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
  if (token) return fetchDayCountViaApi(token, login, date);
  const { from, to } = dayWindowUTC(date);
  try {
    const { $ } = await import("bun");
    const proc = await $`gh api graphql -f query=${QUERY} -f login=${login} -f from=${from} -f to=${to}`.quiet().nothrow();
    if (proc.exitCode !== 0) return null;
    const payload = JSON.parse(proc.text());
    return pickDay(payload, date);
  } catch {
    return null;
  }
}

export function resolveLogin(envLogin: string | undefined, viewer: string | null): string | null {
  return envLogin || viewer;
}

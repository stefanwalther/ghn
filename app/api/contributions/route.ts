import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { eq } from "drizzle-orm";
import { contributionDays } from "@/db/schema";
import { getStoredToken } from "@/lib/github";
import { readSyncState } from "@/lib/sync";
import {
  fetchDayCount,
  fetchRangeCounts,
  getViewerLogin,
  isFresh,
  isValidDay,
  lastNDates,
  resolveLogin,
  todayUTC,
} from "@/lib/contributions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { db } = await import("@/db/client");
  const url = new URL(request.url);
  const now = nowMs();
  const today = todayUTC();
  const raw = url.searchParams.get("date") || today;
  if (!isValidDay(raw)) {
    return NextResponse.json({ error: "`date` must be YYYY-MM-DD" }, { status: 400 });
  }

  const storedLogin = await readSyncState(db, "viewerLogin");
  const token = await getStoredToken();
  const login = resolveLogin(process.env.GHN_LOGIN, storedLogin ?? (await getViewerLogin(token)));

  const daysParam = url.searchParams.get("days");
  if (daysParam !== null) {
    const days = Number(daysParam);
    if (!Number.isInteger(days) || days < 2 || days > 366) {
      return NextResponse.json({ error: "`days` must be an integer between 2 and 366" }, { status: 400 });
    }
    const dates = lastNDates(today, days);
    const rows = await db.select().from(contributionDays);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const allFresh = dates.every((d) => {
      const row = byDate.get(d);
      return row !== undefined && isFresh(row.fetchedAt, now, d, today);
    });
    if (allFresh) {
      return NextResponse.json({
        days: dates.map((date) => ({ date, count: byDate.get(date)!.count })),
        cached: true,
        login,
      });
    }
    if (!login) {
      const partial = dates
        .filter((d) => byDate.get(d) !== undefined)
        .map((date) => ({ date, count: byDate.get(date)!.count }));
      if (partial.length > 0)
        return NextResponse.json({ days: partial, cached: true, login: null, partial: true });
      return NextResponse.json({ error: "github auth unavailable" }, { status: 503 });
    }
    const counts = await fetchRangeCounts(login, dates[0], dates[dates.length - 1], token);
    if (counts === null) {
      const partial = dates
        .filter((d) => byDate.get(d) !== undefined)
        .map((date) => ({ date, count: byDate.get(date)!.count }));
      if (partial.length > 0)
        return NextResponse.json({ days: partial, cached: true, login, partial: true });
      return NextResponse.json({ error: "github unreachable" }, { status: 503 });
    }
    for (const date of dates) {
      if (typeof counts[date] !== "number") continue;
      await db
        .insert(contributionDays)
        .values({ date, count: counts[date], fetchedAt: now })
        .onConflictDoUpdate({
          target: contributionDays.date,
          set: { count: counts[date], fetchedAt: now },
        });
    }
    return NextResponse.json({
      days: dates.map((date) => ({ date, count: typeof counts[date] === "number" ? counts[date] : byDate.get(date)?.count ?? 0 })),
      cached: false,
      login,
    });
  }

  const cached = (
    await db.select().from(contributionDays).where(eq(contributionDays.date, raw))
  )[0];
  if (cached && isFresh(cached.fetchedAt, now, raw, today)) {
    return NextResponse.json({ date: raw, count: cached.count, cached: true, login });
  }

  if (!login) {
    if (cached)
      return NextResponse.json({ date: raw, count: cached.count, cached: true, login: null });
    return NextResponse.json({ error: "github auth unavailable" }, { status: 503 });
  }
  const count = await fetchDayCount(login, raw, token);
  if (count === null) {
    if (cached)
      return NextResponse.json({ date: raw, count: cached.count, cached: true, login });
    return NextResponse.json({ error: "github unreachable" }, { status: 503 });
  }

  await db
    .insert(contributionDays)
    .values({ date: raw, count, fetchedAt: now })
    .onConflictDoUpdate({
      target: contributionDays.date,
      set: { count, fetchedAt: now },
    });
  return NextResponse.json({ date: raw, count, cached: false, login });
}

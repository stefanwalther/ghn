import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { contributionDays } from "@/db/schema";
import {
  fetchDayCount,
  getViewerLogin,
  isFresh,
  isValidDay,
  resolveLogin,
  todayUTC,
} from "@/lib/contributions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { db } = await import("@/db/client");
  const url = new URL(request.url);
  const now = Date.now();
  const today = todayUTC();
  const raw = url.searchParams.get("date") || today;
  if (!isValidDay(raw)) {
    return NextResponse.json({ error: "`date` must be YYYY-MM-DD" }, { status: 400 });
  }

  const cached = (
    await db.select().from(contributionDays).where(eq(contributionDays.date, raw))
  )[0];
  if (cached && isFresh(cached.fetchedAt, now, raw, today)) {
    return NextResponse.json({ date: raw, count: cached.count, cached: true });
  }

  const login = resolveLogin(process.env.GHN_LOGIN, await getViewerLogin());
  if (!login) {
    if (cached) return NextResponse.json({ date: raw, count: cached.count, cached: true });
    return NextResponse.json({ error: "github auth unavailable" }, { status: 503 });
  }
  const count = await fetchDayCount(login, raw);
  if (count === null) {
    if (cached) return NextResponse.json({ date: raw, count: cached.count, cached: true });
    return NextResponse.json({ error: "github unreachable" }, { status: 503 });
  }

  await db
    .insert(contributionDays)
    .values({ date: raw, count, fetchedAt: now })
    .onConflictDoUpdate({
      target: contributionDays.date,
      set: { count, fetchedAt: now },
    });
  return NextResponse.json({ date: raw, count, cached: false });
}

import { NextResponse } from "next/server";
import { notifications } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }
  const { db } = await import("@/db/client");
  const body = await request.json().catch(() => null);
  const forced = body?.force === true;
  if (!forced) {
    const rows = await db.select({ id: notifications.id }).from(notifications);
    const hasLive = rows.some((r) => !r.id.startsWith("n_"));
    if (hasLive) {
      return NextResponse.json(
        { error: "live rows present; reseed refused without { force: true }" },
        { status: 409 }
      );
    }
  }
  const { seedDatabase } = await import("@/lib/seed");
  const result = await seedDatabase();
  return NextResponse.json(result);
}

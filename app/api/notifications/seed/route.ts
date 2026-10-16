import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }
  const { seedDatabase } = await import("@/lib/seed");
  const result = await seedDatabase();
  return NextResponse.json(result);
}

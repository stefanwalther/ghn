import { NextResponse } from "next/server";
import { getDatabaseStatus } from "@/lib/settings-status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { database: getDatabaseStatus() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

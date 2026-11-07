import { NextResponse } from "next/server";
import { getDatabaseStatus, getGithubStatus } from "@/lib/settings-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const [database, github] = await Promise.all([
    Promise.resolve(getDatabaseStatus()),
    getGithubStatus(),
  ]);

  return NextResponse.json(
    { database, github },
    { headers: { "Cache-Control": "no-store" } }
  );
}

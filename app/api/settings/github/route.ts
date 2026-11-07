import { NextResponse } from "next/server";
import { getGithubStatus } from "@/lib/settings-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const github = await getGithubStatus();
  return NextResponse.json({ github }, { headers: { "Cache-Control": "no-store" } });
}

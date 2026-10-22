import { NextResponse } from "next/server";
import { getUpdateInfo } from "@/lib/update-check";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getUpdateInfo();
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}

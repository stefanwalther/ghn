import { NextResponse } from "next/server";
import { probeConnection } from "@/lib/github";
import { readSyncStatus } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await import("@/db/client");
  const probe = await probeConnection();
  const { lastSyncAt, pollIntervalSecs, stale } = await readSyncStatus(db);
  if (!probe.connected) {
    return NextResponse.json({
      connected: false,
      reason: probe.reason ?? "auth",
      hint: "Set GH_TOKEN or run `gh auth login` on the server and refresh.",
      lastSyncAt,
      pollIntervalSecs,
      stale: true,
    });
  }
  return NextResponse.json({
    connected: true,
    viewerLogin: probe.viewerLogin,
    lastSyncAt,
    pollIntervalSecs,
    stale,
  });
}

import { NextResponse } from "next/server";
import { probeConnection } from "@/lib/github";
import { readSyncState } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db } = await import("@/db/client");
  const probe = await probeConnection();
  const lastSyncRaw = await readSyncState(db, "lastSyncAt");
  const lastSyncAt = lastSyncRaw ? Number.parseInt(lastSyncRaw, 10) : null;
  if (!probe.connected) {
    return NextResponse.json({
      connected: false,
      reason: probe.reason ?? "auth",
      hint: "Run `gh auth login` on the server and refresh.",
      lastSyncAt,
    });
  }
  return NextResponse.json({
    connected: true,
    viewerLogin: probe.viewerLogin,
    lastSyncAt,
  });
}

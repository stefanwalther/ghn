import { NextResponse } from "next/server";
import { getRateLimits } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";

// NOTE: usage is read from X-RateLimit-* response headers on one cheap probe
// per bucket (GET /user, one minimal GraphQL viewer query, one search).
// GET /rate_limit is deliberately not used: with the OAuth App token that
// `gh auth login` mints it always reports used=0 while the headers report the
// true user-wide bucket. Each refresh costs 1 request per bucket.
export async function GET() {
  const result = await getRateLimits();
  if (!result.ok) {
    const status = result.error.reason === "auth" ? 401 : 502;
    return NextResponse.json(
      { provider: "github", error: result.error.error, reason: result.error.reason },
      { status }
    );
  }
  return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
}

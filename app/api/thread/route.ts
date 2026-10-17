import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { fetchCheckSummary, fetchSubjectContent, fetchThreadComments, fetchWorkflowRuns, getStoredToken, parseBranchFromTitle, parsePullCoords, parseRepoCoords, subjectApiUrlFromHtml, subjectCommentsUrlFromHtml } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { db } = await import("@/db/client");
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const rows = await db.select().from(notifications).where(eq(notifications.id, id));
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const token = await getStoredToken();
  if (!token) {
    return NextResponse.json({ error: "auth" }, { status: 503 });
  }
  if (row.subjectType === "CheckSuite") {
    const coords = parseRepoCoords(row.sourceUrl);
    const runs = coords
      ? await fetchWorkflowRuns(token, {
          ...coords,
          branch: parseBranchFromTitle(row.subject),
        })
      : [];
    return NextResponse.json({ content: null, comments: [], checks: null, runs });
  }
  const apiUrl = subjectApiUrlFromHtml(row.sourceUrl);
  if (!apiUrl) {
    return NextResponse.json({ error: "preview_unavailable" }, { status: 422 });
  }
  const content = await fetchSubjectContent(token, apiUrl);
  if (!content) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
  const commentsUrl = subjectCommentsUrlFromHtml(row.sourceUrl);
  const comments = commentsUrl ? await fetchThreadComments(token, commentsUrl) : [];
  const coords = parsePullCoords(apiUrl);
  const checks =
    coords && content.headSha
      ? await fetchCheckSummary(token, { ...coords, sha: content.headSha })
      : null;
  return NextResponse.json({ ...content, comments, checks });
}

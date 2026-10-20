import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { fetchCheckSummary, fetchDependabotAlert, fetchSubjectContent, fetchThread, fetchThreadComments, fetchWorkflowRuns, getStoredToken, parseBranchFromTitle, parseDependabotAlertCoords, parsePullCoords, parseRepoCoords, resolveSubjectHtmlUrl, subjectApiUrlFromHtml, subjectCommentsUrlFromHtml } from "@/lib/github";

export const dynamic = "force-dynamic";

function isDependabotRow(row: { subjectType?: string | null; reason: string; sourceUrl: string }): boolean {
  if (
    row.subjectType === "RepositoryDependabotAlertsThread" ||
    row.subjectType === "RepositoryVulnerabilityAlert" ||
    row.subjectType === "DependabotAlert"
  ) {
    return true;
  }
  if (row.reason === "security_alert") return true;
  return parseDependabotAlertCoords(row.sourceUrl) !== null;
}

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
  if (isDependabotRow(row)) {
    const fromHtml = subjectApiUrlFromHtml(row.sourceUrl);
    let resolvedApi =
      fromHtml && fromHtml.includes("/dependabot/alerts/")
        ? fromHtml
        : parseDependabotAlertCoords(row.sourceUrl)
          ? row.sourceUrl
          : null;
    if (!resolvedApi) {
      // Heal rows synced before alert urls were supported: re-fetch the
      // thread to recover the subject url, then persist the fixed sourceUrl.
      const fetched = await fetchThread(token, row.id);
      if (fetched.ok && fetched.data?.subjectApiUrl) {
        const html = await resolveSubjectHtmlUrl(token, fetched.data, new Map());
        const api = subjectApiUrlFromHtml(html);
        if (api && api.includes("/dependabot/alerts/")) {
          resolvedApi = api;
          await db
            .update(notifications)
            .set({ sourceUrl: html })
            .where(eq(notifications.id, row.id));
        }
      }
    }
    if (!resolvedApi) {
      return NextResponse.json({ error: "preview_unavailable" }, { status: 422 });
    }
    const alert = await fetchDependabotAlert(token, resolvedApi);
    if (!alert) {
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }
    return NextResponse.json({ content: null, comments: [], checks: null, runs: [], alert });
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

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { notifications } from "@/db/schema";
import {
  deleteBranch,
  fetchPullRequestExtra,
  fetchRepoMergeSettings,
  getStoredToken,
  markPullRequestReady,
  mergePullRequest,
  parsePullCoords,
  setPullRequestAutoMerge,
  subjectApiUrlFromHtml,
  updatePullRequestState,
  type PullMergeMethod,
} from "@/lib/github";

export const dynamic = "force-dynamic";

const ACTIONS = [
  "merge",
  "enable_auto_merge",
  "disable_auto_merge",
  "close",
  "reopen",
  "ready_for_review",
  "convert_to_draft",
  "delete_branch",
] as const;

type Action = (typeof ACTIONS)[number];

const METHODS: PullMergeMethod[] = ["merge", "squash", "rebase"];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

/**
 * Pull-request actions from the drawer. Every action resolves the pull
 * coordinates from the stored notification row, so the client never sends
 * owner/repo/number and cannot act on a different pull request.
 */
export async function POST(request: Request) {
  const { db } = await import("@/db/client");
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const body = payload as { id?: unknown; action?: unknown; method?: unknown };
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  if (!isAction(body.action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const method: PullMergeMethod =
    typeof body.method === "string" &&
    (METHODS as readonly string[]).includes(body.method)
      ? (body.method as PullMergeMethod)
      : "squash";

  const rows = await db.select().from(notifications).where(eq(notifications.id, body.id));
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const token = await getStoredToken();
  if (!token) {
    return NextResponse.json({ error: "auth" }, { status: 503 });
  }
  const apiUrl = subjectApiUrlFromHtml(row.sourceUrl);
  const coords = apiUrl ? parsePullCoords(apiUrl) : null;
  if (!coords) {
    return NextResponse.json({ error: "not a pull request" }, { status: 422 });
  }

  switch (body.action) {
    case "merge": {
      const result = await mergePullRequest(token, { ...coords, method });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }
    case "enable_auto_merge":
    case "disable_auto_merge": {
      const extra = await fetchPullRequestExtra(token, apiUrl as string);
      if (!extra?.nodeId) {
        return NextResponse.json({ error: "pull details unavailable" }, { status: 502 });
      }
      const result = await setPullRequestAutoMerge(token, {
        nodeId: extra.nodeId,
        method,
        disable: body.action === "disable_auto_merge",
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }
    case "close":
    case "reopen": {
      const result = await updatePullRequestState(token, {
        ...coords,
        state: body.action === "close" ? "closed" : "open",
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }
    case "ready_for_review":
    case "convert_to_draft": {
      const extra = await fetchPullRequestExtra(token, apiUrl as string);
      if (!extra?.nodeId) {
        return NextResponse.json({ error: "pull details unavailable" }, { status: 502 });
      }
      const result = await markPullRequestReady(token, {
        nodeId: extra.nodeId,
        draft: body.action === "convert_to_draft",
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }
    case "delete_branch": {
      const [extra, settings] = await Promise.all([
        fetchPullRequestExtra(token, apiUrl as string),
        fetchRepoMergeSettings(token, { owner: coords.owner, repo: coords.repo }),
      ]);
      const branch = extra?.headRef;
      if (!branch || branch === settings?.defaultBranch) {
        return NextResponse.json({ error: "no deletable branch" }, { status: 422 });
      }
      const result = await deleteBranch(token, { ...coords, branch });
      return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    }
  }
}

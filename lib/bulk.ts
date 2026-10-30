const ACTIONS = new Set(["done", "unread", "read", "unsubscribe"]);

export function validateBulkInput(
  ids: unknown,
  action: unknown
): { ok: true; ids: string[]; action: string } | { ok: false; status: number } {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    typeof action !== "string" ||
    !ACTIONS.has(action)
  ) {
    return { ok: false, status: 400 };
  }
  const cleanIds = [...new Set(ids.filter((v): v is string => typeof v === "string"))];
  if (cleanIds.length === 0) return { ok: false, status: 400 };
  return { ok: true, ids: cleanIds, action };
}

export interface BulkOutcome {
  updated: number;
  queued: number;
  error?: string | null;
  remote?: string | null;
}

/**
 * Shared thresholds: small bulks stay strongly consistent (remote awaited on
 * the request), large bulks go local-first with background write-back. The
 * same cutoff gates the destructive confirm dialog so one number explains
 * both behaviors.
 */
export const BULK_CONFIRM_THRESHOLD = 25;

/** Validation for repo-wide bulk actions: { repositoryId, action }. */
export function validateBulkRepoInput(
  repositoryId: unknown,
  action: unknown
): { ok: true; repositoryId: string; action: "done" | "read" } | { ok: false; status: number } {
  if (
    typeof repositoryId !== "string" ||
    repositoryId.length === 0 ||
    (action !== "done" && action !== "read")
  ) {
    return { ok: false, status: 400 };
  }
  return { ok: true, repositoryId, action };
}

function bulkReasonText(reason: string | null | undefined): string {
  if (reason === "auth") return "GitHub access missing";
  if (reason === "rate_limited") return "GitHub rate limit reached";
  if (reason === "network") return "GitHub unreachable";
  return "GitHub reported an error";
}

function bulkActionLabel(action: string): string {
  if (action === "done") return "marked done";
  if (action === "read") return "marked read";
  if (action === "unread") return "marked unread";
  if (action === "unsubscribe") return "unsubscribed";
  return action;
}

// Human-readable notice for a bulk response that queued write-backs.
// Returns null when everything applied remotely and no notice is needed.
export function describeBulkResult(action: string, outcome: BulkOutcome): string | null {
  if (outcome.remote === "background" && outcome.updated > 0) {
    return (
      `${outcome.updated} ${bulkActionLabel(action)}, ` +
      `syncing to GitHub in background.`
    );
  }
  if (outcome.queued <= 0) return null;
  const reason = bulkReasonText(outcome.error);
  if (outcome.updated > 0) {
    return (
      `Partially applied: ${outcome.updated} ${bulkActionLabel(action)}, ` +
      `${outcome.queued} queued for retry (${reason}).`
    );
  }
  return (
    `${reason}. ${outcome.queued} action(s) queued for retry; ` +
    `items restored until GitHub confirms.`
  );
}

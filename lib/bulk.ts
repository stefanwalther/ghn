const ACTIONS = new Set(["done", "unread", "read"]);

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

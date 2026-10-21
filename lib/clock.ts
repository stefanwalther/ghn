/**
 * Single source of "now".
 *
 * Production reads the real clock. The test suite pins it with `GHN_NOW` so
 * the seeded dataset, the API filters and the browser all agree on the
 * current instant. Without this, a dataset seeded at a frozen instant shifts
 * every age bucket as soon as it is read later, because the API filters
 * against the wall clock.
 *
 * A malformed value falls back to the real clock rather than throwing, so a
 * bad value degrades to "not pinned" instead of breaking the application.
 */
export function nowMs(): number {
  const raw = process.env.GHN_NOW?.trim();
  if (!raw) return Date.now();

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return asNumber;

  const asDate = Date.parse(raw);
  return Number.isNaN(asDate) ? Date.now() : asDate;
}

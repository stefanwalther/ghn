/**
 * Relative "ago" formatting for sync timestamps.
 *
 * The inbox header shows when the last successful GitHub sync happened.
 * An absolute clock time ("02:20 PM") forces mental math and goes stale
 * on a long-lived page; a relative label ("12 hrs ago", "4 days ago")
 * reads instantly. The absolute time stays available as a tooltip.
 */
export function formatRelativeTime(ts: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - ts);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins === 1 ? "1 min ago" : `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs === 1 ? "1 hr ago" : `${hrs} hrs ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 mo ago" : `${months} mos ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 yr ago" : `${years} yrs ago`;
}

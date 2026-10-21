/**
 * The messages the inbox shows when a sync fails.
 *
 * Each reason gets its own wording, because the user's next move differs:
 * one has to reconnect, one has to wait, and one has to check the network.
 */
export function syncErrorMessage(reason: unknown): string {
  if (reason === "auth") {
    return "GitHub access missing. Set GH_TOKEN or run `gh auth login` on the server and refresh.";
  }
  if (reason === "rate_limited") {
    return "GitHub rate limit reached. Retry shortly; cached inbox shown.";
  }
  if (reason === "network") {
    return "GitHub unreachable. Showing cached inbox.";
  }
  return "Sync failed. Showing last loaded data.";
}

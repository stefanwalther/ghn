export const GHN_SYNC_EVENT = "ghn:sync";

export interface GhnSyncDetail {
  syncing: boolean;
}

/** Tell the sidebar brand mark a sync started or finished. */
export function announceSync(syncing: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GhnSyncDetail>(GHN_SYNC_EVENT, { detail: { syncing } })
  );
}

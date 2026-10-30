import { create } from "zustand";
import type { InboxItem } from "@/components/inbox/notification-list";

export interface OpenThreadRequest {
  id: string;
  repositoryId?: string;
  /**
   * Full snapshot from the palette's own cache. Lets the inbox open the
   * drawer even when the thread is absent from the current filter view
   * (different state, type, or digest bucket).
   */
  item?: InboxItem | null;
  /** Monotonic sequence so repeated opens of the same thread re-trigger. */
  n: number;
}

export interface MenuRequest {
  /** Row id whose context menu should open. */
  id: string;
  /** Monotonic sequence so repeats re-trigger. */
  n: number;
}

interface UIState {
  sidebarOpen: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  openThread: OpenThreadRequest | null;
  menuRequest: MenuRequest | null;
  refreshRequest: number;
  scrollTopRequest: number;
  /** Narrows the inbox repository list; set from the palette, edited in the sidebar. */
  repoListFilter: string;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  openPalette: () => void;
  closePalette: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  requestOpenThread: (id: string, repositoryId?: string, item?: InboxItem | null) => void;
  consumeOpenThread: () => void;
  requestMenu: (id: string) => void;
  requestRefresh: () => void;
  requestScrollTop: () => void;
  setRepoListFilter: (query: string) => void;
}

const SIDEBAR_KEY = "ghn:sidebar";

function readSidebarInitial(): boolean {
  try {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SIDEBAR_KEY);
    if (saved === "closed") return false;
    if (saved !== "open" && window.innerWidth < 768) return false;
    return true;
  } catch {
    return true;
  }
}

function persistSidebar(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
  } catch {
    // ignore private-mode failures
  }
}

let openThreadSeq = 0;
let menuSeq = 0;

function baseState(): Pick<
  UIState,
  | "sidebarOpen"
  | "paletteOpen"
  | "helpOpen"
  | "openThread"
  | "menuRequest"
  | "refreshRequest"
  | "scrollTopRequest"
  | "repoListFilter"
> {
  return {
    sidebarOpen: true,
    paletteOpen: false,
    helpOpen: false,
    openThread: null,
    menuRequest: null,
    refreshRequest: 0,
    scrollTopRequest: 0,
    repoListFilter: "",
  };
}

/**
 * Ephemeral global UI state. Holds cross-page UI flags only; server records
 * and URL filters stay out. Sidebar persistence reuses the legacy storage key.
 */
export const useUIStore = create<UIState>()((set) => ({
  ...baseState(),
  sidebarOpen: readSidebarInitial(),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarOpen;
      persistSidebar(next);
      return { sidebarOpen: next };
    }),
  setSidebar: (open) => {
    persistSidebar(open);
    set({ sidebarOpen: open });
  },
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
  requestOpenThread: (id, repositoryId, item) => {
    openThreadSeq += 1;
    set({ openThread: { id, repositoryId, item: item ?? null, n: openThreadSeq } });
  },
  consumeOpenThread: () => set({ openThread: null }),
  requestMenu: (id) => {
    menuSeq += 1;
    set({ menuRequest: { id, n: menuSeq } });
  },
  requestRefresh: () => set((s) => ({ refreshRequest: s.refreshRequest + 1 })),
  requestScrollTop: () => set((s) => ({ scrollTopRequest: s.scrollTopRequest + 1 })),
  setRepoListFilter: (query) => set({ repoListFilter: query }),
}));

/** Test helper: restore the store to inert defaults between checks. */
export function resetUIStore(): void {
  useUIStore.setState({ ...baseState(), sidebarOpen: true });
}

import { create } from "zustand";

export interface OpenThreadRequest {
  id: string;
  repositoryId?: string;
  /** Monotonic sequence so repeated opens of the same thread re-trigger. */
  n: number;
}

interface UIState {
  sidebarOpen: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  openThread: OpenThreadRequest | null;
  refreshRequest: number;
  scrollTopRequest: number;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;
  openPalette: () => void;
  closePalette: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  requestOpenThread: (id: string, repositoryId?: string) => void;
  consumeOpenThread: () => void;
  requestRefresh: () => void;
  requestScrollTop: () => void;
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

function baseState(): Pick<
  UIState,
  | "sidebarOpen"
  | "paletteOpen"
  | "helpOpen"
  | "openThread"
  | "refreshRequest"
  | "scrollTopRequest"
> {
  return {
    sidebarOpen: true,
    paletteOpen: false,
    helpOpen: false,
    openThread: null,
    refreshRequest: 0,
    scrollTopRequest: 0,
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
  requestOpenThread: (id, repositoryId) => {
    openThreadSeq += 1;
    set({ openThread: { id, repositoryId, n: openThreadSeq } });
  },
  consumeOpenThread: () => set({ openThread: null }),
  requestRefresh: () => set((s) => ({ refreshRequest: s.refreshRequest + 1 })),
  requestScrollTop: () => set((s) => ({ scrollTopRequest: s.scrollTopRequest + 1 })),
}));

/** Test helper: restore the store to inert defaults between checks. */
export function resetUIStore(): void {
  useUIStore.setState({ ...baseState(), sidebarOpen: true });
}

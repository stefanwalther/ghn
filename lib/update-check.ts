import { APP_VERSION, GITHUB_REPO_URL } from "@/lib/app-meta";
import { getStoredToken } from "@/lib/github";
import { isNewerVersion, normalizeVersionTag } from "@/lib/version";

export const UPDATE_REPO = "stefanwalther/ghn";
export const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

export interface UpdateInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string;
  checkedAt: string;
}

let cached: { at: number; info: UpdateInfo } | null = null;

/** Clears the in-memory release cache. Tests use this between cases. */
export function resetUpdateCache(): void {
  cached = null;
}

function releasesBase(): string {
  const override = (process.env.GHN_RELEASES_API_BASE ?? "").trim().replace(/\/+$/, "");
  if (override) return override;
  return "https://api.github.com";
}

function updateCheckDisabled(): boolean {
  const value = (process.env.GHN_DISABLE_UPDATE_CHECK ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function fallbackInfo(now: number): UpdateInfo {
  return {
    current: APP_VERSION,
    latest: null,
    updateAvailable: false,
    releaseUrl: `${GITHUB_REPO_URL}/releases`,
    checkedAt: new Date(now).toISOString(),
  };
}

export async function getUpdateInfo(
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<UpdateInfo> {
  if (cached && now - cached.at < UPDATE_CACHE_TTL_MS) return cached.info;
  if (updateCheckDisabled()) {
    const info = fallbackInfo(now);
    cached = { at: now, info };
    return info;
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `ghn/${APP_VERSION}`,
    };
    try {
      const token = await getStoredToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // An unreachable credential helper must not block the check.
    }
    const res = await fetchImpl(`${releasesBase()}/repos/${UPDATE_REPO}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const info = fallbackInfo(now);
      cached = { at: now, info };
      return info;
    }
    const payload = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    const tag = typeof payload.tag_name === "string" ? normalizeVersionTag(payload.tag_name) : "";
    const releaseUrl =
      typeof payload.html_url === "string" && payload.html_url
        ? payload.html_url
        : `${GITHUB_REPO_URL}/releases`;
    if (!tag) {
      const info = fallbackInfo(now);
      cached = { at: now, info };
      return info;
    }
    const info: UpdateInfo = {
      current: APP_VERSION,
      latest: tag,
      updateAvailable: isNewerVersion(APP_VERSION, tag),
      releaseUrl,
      checkedAt: new Date(now).toISOString(),
    };
    cached = { at: now, info };
    return info;
  } catch {
    const info = fallbackInfo(now);
    cached = { at: now, info };
    return info;
  }
}

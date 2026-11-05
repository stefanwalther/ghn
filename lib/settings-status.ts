import { getResolvedConfig } from "@/lib/config";
import { getDatabaseSizeBytes } from "@/lib/database-size";
import { getStoredToken, probeConnection, tokenDisabled } from "@/lib/github";

export type TokenSource = "GHN_TOKEN" | "GH_TOKEN" | "GITHUB_TOKEN" | "gh CLI" | "none";

export interface DatabaseStatus {
  configPath: string;
  databasePath: string;
  sizeBytes: number | null;
}

export interface GithubStatus {
  connected: boolean;
  viewerLogin: string | null;
  reason: string | null;
  tokenPresent: boolean;
  tokenSource: TokenSource;
  ghCliAuthenticated: boolean;
  ghCliDetail: string | null;
}

export function describeTokenSource(token: string | null): TokenSource {
  if (tokenDisabled()) return "none";
  if (process.env.GHN_TOKEN?.trim()) return "GHN_TOKEN";
  if (process.env.GH_TOKEN?.trim()) return "GH_TOKEN";
  if (process.env.GITHUB_TOKEN?.trim()) return "GITHUB_TOKEN";
  if (token) return "gh CLI";
  return "none";
}

export async function checkGhCli(): Promise<{ authenticated: boolean; detail: string | null }> {
  if (tokenDisabled()) {
    return { authenticated: false, detail: "Token explicitly disabled via empty GHN_TOKEN." };
  }
  try {
    const { $ } = await import("bun");
    const result = (await $`gh auth status`.quiet().nothrow()) as unknown as {
      exitCode: number;
      text: () => string;
    };
    let detail: string | null = null;
    try {
      detail = result.text().trim() || null;
    } catch {
      detail = null;
    }
    return { authenticated: result.exitCode === 0, detail };
  } catch (err) {
    return {
      authenticated: false,
      detail: err instanceof Error ? err.message : "gh CLI not available.",
    };
  }
}

export function getDatabaseStatus(): DatabaseStatus {
  const { configPath, databasePath } = getResolvedConfig();
  return { configPath, databasePath, sizeBytes: getDatabaseSizeBytes(databasePath) };
}

export async function getGithubStatus(): Promise<GithubStatus> {
  const [token, probe, ghCli] = await Promise.all([
    getStoredToken(),
    probeConnection(),
    checkGhCli(),
  ]);
  return {
    connected: probe.connected,
    viewerLogin: probe.viewerLogin,
    reason: probe.reason ?? null,
    tokenPresent: token !== null,
    tokenSource: describeTokenSource(token),
    ghCliAuthenticated: ghCli.authenticated,
    ghCliDetail: ghCli.detail,
  };
}

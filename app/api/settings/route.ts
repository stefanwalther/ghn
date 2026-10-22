import { NextResponse } from "next/server";
import { getResolvedConfig } from "@/lib/config";
import { getStoredToken, probeConnection, tokenDisabled } from "@/lib/github";

export const dynamic = "force-dynamic";

export type TokenSource = "GHN_TOKEN" | "GH_TOKEN" | "GITHUB_TOKEN" | "gh CLI" | "none";

function describeTokenSource(token: string | null): TokenSource {
  if (tokenDisabled()) return "none";
  if (process.env.GHN_TOKEN?.trim()) return "GHN_TOKEN";
  if (process.env.GH_TOKEN?.trim()) return "GH_TOKEN";
  if (process.env.GITHUB_TOKEN?.trim()) return "GITHUB_TOKEN";
  if (token) return "gh CLI";
  return "none";
}

async function checkGhCli(): Promise<{ authenticated: boolean; detail: string | null }> {
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

export async function GET() {
  const { configPath, databasePath } = getResolvedConfig();
  const token = await getStoredToken();
  const probe = await probeConnection();
  const ghCli = await checkGhCli();

  return NextResponse.json(
    {
      database: { configPath, databasePath },
      github: {
        connected: probe.connected,
        viewerLogin: probe.viewerLogin,
        reason: probe.reason ?? null,
        tokenPresent: token !== null,
        tokenSource: describeTokenSource(token),
        ghCliAuthenticated: ghCli.authenticated,
        ghCliDetail: ghCli.detail,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

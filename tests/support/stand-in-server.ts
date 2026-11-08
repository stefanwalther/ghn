import { startGitHubStandIn } from "./github-stand-in";
import { buildSeedSubjects, buildSeedThreads, FROZEN_EPOCH } from "@/lib/seed-data";
import { nowMs } from "@/lib/clock";

/**
 * The GitHub stand-in as a standalone process.
 *
 * The end-to-end layer runs the application as a separate process, so the
 * stand-in has to be reachable over HTTP. It serves the same dataset the
 * database is seeded with, including the per-item subject payloads, so a
 * sync against it leaves the dataset unchanged.
 */
const port = Number(process.env.STANDIN_PORT ?? 21141);
const token = process.env.STANDIN_TOKEN ?? "e2e-stand-in-token";

const now = nowMs();
const standIn = await startGitHubStandIn({ port, token });
standIn.setThreads(buildSeedThreads(standIn.url, now));

for (const [path, payload] of buildSeedSubjects(now)) {
  standIn.setSubject(path, payload);
}

// The release-preview journey scripts its own release thread. The frozen
// dataset has no Release subject rows (adding one would ripple through
// every exact-count assertion), so this path is additive only.
standIn.setSubject("/repos/acme/web/releases/tags/v9.9.9-e2e", {
  tag_name: "v9.9.9-e2e",
  name: "E2E nightly v9.9.9-e2e",
  body: "## Highlights\n\n- one\n- two",
  draft: false,
  prerelease: true,
  author: { login: "github-actions" },
  html_url: "https://github.com/acme/web/releases/tag/v9.9.9-e2e",
  published_at: "2026-01-14T12:00:00Z",
  created_at: "2026-01-14T11:00:00Z",
  target_commitish: "4cb6945",
  assets: [
    {
      name: "nightly-mac.yml",
      size: 786,
      browser_download_url:
        "https://github.com/acme/web/releases/download/v9.9.9-e2e/nightly-mac.yml",
    },
    { name: "checksums.txt", size: null, browser_download_url: null },
  ],
});

console.log(
  `stand-in listening on ${standIn.url} with the ${FROZEN_EPOCH} dataset`
);

const shutdown = async () => {
  await standIn.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

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

console.log(
  `stand-in listening on ${standIn.url} with the ${FROZEN_EPOCH} dataset`
);

const shutdown = async () => {
  await standIn.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

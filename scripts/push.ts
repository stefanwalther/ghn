import { Database } from "bun:sqlite";
import { ensureParentDir, getDatabasePath } from "@/lib/config";
import { ensureSchema } from "@/db/ensure-schema";

function main(): void {
  const dbPath = getDatabasePath();
  ensureParentDir(dbPath);
  const sqlite = new Database(dbPath, { create: true });
  ensureSchema(sqlite);
  console.log(JSON.stringify({ pushed: true }));
}

if (import.meta.path === Bun.main) {
  main();
}

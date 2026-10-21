import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureSchema } from "@/db/ensure-schema";

const url = "./data/quiet-notifications.db";

function main(): void {
  mkdirSync(dirname(url), { recursive: true });
  const sqlite = new Database(url, { create: true });
  ensureSchema(sqlite);
  console.log(JSON.stringify({ pushed: true }));
}

if (import.meta.path === Bun.main) {
  main();
}

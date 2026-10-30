import { afterEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDatabaseSize } from "@/lib/format-database-size";
import { getDatabaseSizeBytes } from "@/lib/database-size";

let tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function makeDb(files: Record<string, number>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghn-db-size-"));
  tmpDirs.push(dir);
  const dbPath = path.join(dir, "ghn.db");
  for (const [suffix, size] of Object.entries(files)) {
    fs.writeFileSync(`${dbPath}${suffix}`, Buffer.alloc(size));
  }
  return dbPath;
}

describe("getDatabaseSizeBytes", () => {
  test("returns null when no database file exists yet", () => {
    expect(getDatabaseSizeBytes("/tmp/ghn-db-size-missing/ghn.db")).toBeNull();
  });

  test("reports the main file size", () => {
    expect(getDatabaseSizeBytes(makeDb({ "": 1500 }))).toBe(1500);
  });

  test("includes WAL sidecar files", () => {
    expect(getDatabaseSizeBytes(makeDb({ "": 1500, "-wal": 500, "-shm": 32 }))).toBe(2032);
  });
});

describe("formatDatabaseSize", () => {
  test("names a missing database", () => {
    expect(formatDatabaseSize(null)).toBe("Not created yet");
  });

  test("formats bytes, kilobytes, and megabytes", () => {
    expect(formatDatabaseSize(512)).toBe("512 B");
    expect(formatDatabaseSize(1024)).toBe("1 KB (1,024 bytes)");
    expect(formatDatabaseSize(1536)).toBe("1.5 KB (1,536 bytes)");
    expect(formatDatabaseSize(1048576)).toBe("1 MB (1,048,576 bytes)");
  });
});

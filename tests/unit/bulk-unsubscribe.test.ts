import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";

type TestDb = BunSQLiteDatabase<typeof schema>;

const sqlite = new Database(":memory:");
ensureSchema(sqlite);
const testDb: TestDb = drizzle(sqlite, { schema });
(globalThis as Record<string, unknown>).__ghnDb = testDb;

process.env.GH_TOKEN = "test-token";

const { POST } = await import("@/app/api/notifications/bulk/route");

let ignoredThreads: string[];
let stopApi: (() => void) | null = null;

function stubSubscriptionApi(): void {
  ignoredThreads = [];
  const server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url);
      if (req.method === "PUT" && url.pathname.endsWith("/subscription")) {
        const parts = url.pathname.split("/");
        ignoredThreads.push(parts[parts.length - 2] ?? "");
        return Response.json({ ignored: true });
      }
      return new Response("unexpected call", { status: 500 });
    },
  });
  process.env.GHN_API_BASE = `http://localhost:${server.port}`;
  stopApi = () => {
    delete process.env.GHN_API_BASE;
    server.stop(true);
    stopApi = null;
  };
}

async function seedSameSubjectPair(): Promise<void> {
  await testDb.delete(schema.writebackQueue);
  await testDb.delete(schema.mutedSubjects);
  await testDb.delete(schema.notifications);
  await testDb.delete(schema.repositories);
  await testDb.insert(schema.repositories).values({
    id: "acme-web",
    fullName: "acme/web",
    ownership: "owned",
    rhythm: "immediate",
    createdAt: 1792000000000,
  });
  for (const id of ["1001", "1002"]) {
    await testDb.insert(schema.notifications).values({
      id,
      repositoryId: "acme-web",
      subject: "CI failed on main",
      reason: "subscribed",
      createdAt: 1792000000000,
      sourceUrl: "https://github.com/acme/web/pull/12",
    });
  }
}

describe("bulk unsubscribe with shared repository and subject", () => {
  beforeEach(async () => {
    stubSubscriptionApi();
    await seedSameSubjectPair();
  });

  afterEach(() => {
    stopApi?.();
  });

  test("ignores every selected thread, not one per pair", async () => {
    const res = await POST(
      new Request("http://localhost/api/notifications/bulk", {
        method: "POST",
        body: JSON.stringify({ ids: ["1001", "1002"], action: "unsubscribe" }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2, action: "unsubscribe" });
    expect([...ignoredThreads].sort()).toEqual(["1001", "1002"]);

    const muted = await testDb.select().from(schema.mutedSubjects);
    expect(muted).toHaveLength(1);

    for (const id of ["1001", "1002"]) {
      const rows = await testDb
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.id, id));
      expect(rows[0]?.isDone).toBe(1);
    }
  });
});

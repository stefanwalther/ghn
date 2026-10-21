import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { serve } from "../support/http-stub";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "../support/db-client.node";

process.env.GH_TOKEN = "test-token";

const { POST } = await import("@/app/api/notifications/bulk/route");

let ignoredThreads: string[];
let stopApi: (() => void) | null = null;

async function stubSubscriptionApi(): Promise<void> {
  ignoredThreads = [];
  const server = await serve((req) => {
    const url = new URL(req.url);
    if (req.method === "PUT" && url.pathname.endsWith("/subscription")) {
      const parts = url.pathname.split("/");
      ignoredThreads.push(parts[parts.length - 2] ?? "");
      return Response.json({ ignored: true });
    }
    return new Response("unexpected call", { status: 500 });
  });
  process.env.GHN_API_BASE = server.url;
  stopApi = () => {
    delete process.env.GHN_API_BASE;
    void server.stop(true);
    stopApi = null;
  };
}

async function seedSameSubjectPair(): Promise<void> {
  await db.delete(schema.writebackQueue);
  await db.delete(schema.mutedSubjects);
  await db.delete(schema.notifications);
  await db.delete(schema.repositories);
  await db.insert(schema.repositories).values({
    id: "acme-web",
    fullName: "acme/web",
    ownership: "owned",
    rhythm: "immediate",
    createdAt: 1792000000000,
  });
  for (const id of ["1001", "1002"]) {
    await db.insert(schema.notifications).values({
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
    await stubSubscriptionApi();
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

    const muted = await db.select().from(schema.mutedSubjects);
    expect(muted).toHaveLength(1);

    for (const id of ["1001", "1002"]) {
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.id, id));
      expect(rows[0]?.isDone).toBe(1);
    }
  });
});

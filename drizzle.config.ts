import type { Config } from "drizzle-kit";
import { getDatabasePath } from "./lib/config";

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabasePath(),
  },
} satisfies Config;

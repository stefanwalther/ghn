import { describe, expect, test } from "vitest";
import { apiBases } from "@/lib/github";
import { withEnv } from "../support/test-env";

describe("the GitHub base URL", () => {
  test("defaults to the public API", () => {
    const restore = withEnv({ GHN_API_BASE: undefined, GH_HOST: undefined });
    try {
      expect(apiBases()).toEqual({
        restBase: "https://api.github.com",
        graphqlUrl: "https://api.github.com/graphql",
      });
    } finally {
      restore();
    }
  });

  test("an override moves the REST and the GraphQL endpoint together", () => {
    const restore = withEnv({ GHN_API_BASE: "http://127.0.0.1:21141/" });
    try {
      expect(apiBases()).toEqual({
        restBase: "http://127.0.0.1:21141",
        graphqlUrl: "http://127.0.0.1:21141/graphql",
      });
    } finally {
      restore();
    }
  });

  test("an enterprise host keeps the enterprise GraphQL path", () => {
    const restore = withEnv({
      GHN_API_BASE: undefined,
      GH_HOST: "github.acme.internal",
    });
    try {
      expect(apiBases()).toEqual({
        restBase: "https://github.acme.internal/api/v3",
        graphqlUrl: "https://github.acme.internal/api/graphql",
      });
    } finally {
      restore();
    }
  });

  test("an empty override is treated as unset", () => {
    const restore = withEnv({ GHN_API_BASE: "  ", GH_HOST: undefined });
    try {
      expect(apiBases().restBase).toBe("https://api.github.com");
    } finally {
      restore();
    }
  });
});

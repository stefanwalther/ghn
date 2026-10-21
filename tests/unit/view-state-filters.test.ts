import { describe, expect, test } from "vitest";
import {
  parseInboxFilters,
  serializeInboxFilters,
  type InboxFilters,
} from "@/lib/view-state";

const DEFAULTS: InboxFilters = {
  repo: "all",
  state: "unread",
  type: "all",
  age: "all",
};

const AGE_VALUES = ["all", "24h", "48h", "7d", "14d", "30d", "year", "older"];

describe("parseInboxFilters", () => {
  // The inbox opens on the unread items of every repository, with no type
  // and no age restriction.
  test("an empty query string yields the default filters", () => {
    expect(parseInboxFilters(new URLSearchParams())).toEqual(DEFAULTS);
  });

  // The query string is the inbox's whole contract with the browser, so a
  // parameter the application does not know must not change anything.
  test("query parameters the inbox does not know are ignored", () => {
    const params = new URLSearchParams("tab=inbox&sort=newest&page=2");
    expect(parseInboxFilters(params)).toEqual(DEFAULTS);
  });

  // An empty parameter is not a value, so it falls back to the default
  // rather than to an empty filter.
  test("an empty parameter value falls back to the default", () => {
    const params = new URLSearchParams("repo=&state=&type=&age=");
    expect(parseInboxFilters(params)).toEqual(DEFAULTS);
  });

  // The four filters are read from the four parameter names, and nothing
  // else is read.
  test("every filter is read under its own parameter name", () => {
    const params = new URLSearchParams({
      repo: "acme--web",
      state: "done",
      type: "pull_request",
      age: "7d",
    });
    expect(parseInboxFilters(params)).toEqual({
      repo: "acme--web",
      state: "done",
      type: "pull_request",
      age: "7d",
    });
  });

  // "unread", "all" and "done" are the three inbox states. Anything else is
  // a stale or hand-edited value and must not reach the filter.
  test("the state filter accepts only unread, all and done", () => {
    expect(parseInboxFilters(new URLSearchParams("state=unread")).state).toBe("unread");
    expect(parseInboxFilters(new URLSearchParams("state=all")).state).toBe("all");
    expect(parseInboxFilters(new URLSearchParams("state=done")).state).toBe("done");
    expect(parseInboxFilters(new URLSearchParams("state=archived")).state).toBe("unread");
    expect(parseInboxFilters(new URLSearchParams("state=DONE")).state).toBe("unread");
  });

  // The age buckets are a closed set, because each one is a different query
  // on the server.
  test("the age filter accepts only the known buckets", () => {
    for (const age of AGE_VALUES) {
      expect(parseInboxFilters(new URLSearchParams(`age=${age}`)).age).toBe(age);
    }
    expect(parseInboxFilters(new URLSearchParams("age=3d")).age).toBe("all");
    expect(parseInboxFilters(new URLSearchParams("age=90d")).age).toBe("all");
    expect(parseInboxFilters(new URLSearchParams("age=24H")).age).toBe("all");
  });

  // The repository and the type are free-form: the repository is an
  // identifier the server hands out, the type is a notification reason.
  test("the repository and the type are free-form strings", () => {
    expect(parseInboxFilters(new URLSearchParams("repo=acme--web")).repo).toBe("acme--web");
    expect(
      parseInboxFilters(new URLSearchParams("type=security_advisory")).type
    ).toBe("security_advisory");
  });
});

describe("serializeInboxFilters", () => {
  // A default inbox has no query string at all, so the URL stays clean.
  test("the default filters produce no query string at all", () => {
    expect(serializeInboxFilters(DEFAULTS)).toBe("");
  });

  // Only the filters that differ from the default are written, so a shared
  // link never carries a redundant parameter.
  test("only the filters that differ from the default are written", () => {
    expect(serializeInboxFilters({ ...DEFAULTS, repo: "acme--web" })).toBe("?repo=acme--web");
    expect(serializeInboxFilters({ ...DEFAULTS, state: "done" })).toBe("?state=done");
    expect(serializeInboxFilters({ ...DEFAULTS, type: "merged" })).toBe("?type=merged");
    expect(serializeInboxFilters({ ...DEFAULTS, age: "30d" })).toBe("?age=30d");
  });

  // The parameter order is fixed, so two equal filter sets always produce
  // the same URL.
  test("the parameters keep a stable order", () => {
    const query = serializeInboxFilters({
      repo: "acme--web",
      state: "all",
      type: "merged",
      age: "year",
    });
    expect(query).toBe("?repo=acme--web&state=all&type=merged&age=year");
  });

  // "all" is a real state, not the default, so it has to be written even
  // though it reads like a neutral value.
  test("the explicit all state is written out", () => {
    expect(serializeInboxFilters({ ...DEFAULTS, state: "all" })).toBe("?state=all");
  });
});

describe("the filter round trip", () => {
  // A link that is copied out of the inbox has to reproduce the same
  // filters when it is opened again.
  test("every filter survives a serialize and parse cycle", () => {
    const filters: InboxFilters = {
      repo: "acme--web",
      state: "done",
      type: "pull_request",
      age: "48h",
    };
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query))).toEqual(filters);
  });

  // The default filters have no query string, and parsing the empty string
  // gives the default filters back.
  test("the default filters survive a serialize and parse cycle", () => {
    const query = serializeInboxFilters(DEFAULTS);
    expect(parseInboxFilters(new URLSearchParams(query))).toEqual(DEFAULTS);
  });

  // The explicit "all" state is written and read back, it does not decay
  // into the "unread" default.
  test("the explicit all state survives the cycle", () => {
    const filters: InboxFilters = { ...DEFAULTS, state: "all" };
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query))).toEqual(filters);
  });

  // A value that the filter set does not know is normalised on the way
  // back in, so a hand-edited URL cannot reach the query.
  test("an unknown state in the query string is normalised to unread", () => {
    const filters = { ...DEFAULTS, state: "archived" } as unknown as InboxFilters;
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query)).state).toBe("unread");
  });

  // An empty repository name is not a repository, so it reads back as the
  // default "all".
  test("an empty repository name falls back to the default", () => {
    const filters: InboxFilters = { ...DEFAULTS, repo: "" };
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query)).repo).toBe("all");
  });
});

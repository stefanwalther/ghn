import { describe, expect, test } from "vitest";
import {
  displayState,
  filtersEqual,
  isAllAges,
  isAllRepos,
  isAllStates,
  isAllTypes,
  isDoneOnly,
  isUnreadOnly,
  normalizeInboxFilters,
  parseInboxFilters,
  repoFilterHref,
  serializeInboxFilters,
  statesEqual,
  toggleAge,
  toggleInList,
  toggleState,
  type InboxFilters,
} from "@/lib/view-state";

const DEFAULTS: InboxFilters = {
  repos: [],
  states: ["unread"],
  types: [],
  ages: [],
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
      repos: ["acme--web"],
      states: ["done"],
      types: ["pull_request"],
      ages: ["7d"],
    });
  });

  // Multi-select: repeated params and comma lists merge into one set.
  test("repos, types and ages accept several values", () => {
    expect(
      parseInboxFilters(new URLSearchParams("repo=a&repo=b")).repos
    ).toEqual(["a", "b"]);
    expect(
      parseInboxFilters(new URLSearchParams("repo=a,b")).repos
    ).toEqual(["a", "b"]);
    expect(
      parseInboxFilters(new URLSearchParams("type=mention&type=assign")).types
    ).toEqual(["assign", "mention"]);
    expect(
      parseInboxFilters(new URLSearchParams("age=7d&age=30d")).ages
    ).toEqual(["7d", "30d"]);
    expect(
      parseInboxFilters(new URLSearchParams("state=unread&state=done")).states
    ).toEqual(["unread", "done"]);
  });

  // "all" stays backward compatible: ?state=all means both states, while
  // repo/type/age all means no restriction.
  test("the state filter accepts unread, done and all", () => {
    expect(parseInboxFilters(new URLSearchParams("state=unread")).states).toEqual(["unread"]);
    expect(parseInboxFilters(new URLSearchParams("state=all")).states).toEqual([
      "unread",
      "done",
    ]);
    expect(parseInboxFilters(new URLSearchParams("state=done")).states).toEqual(["done"]);
    expect(parseInboxFilters(new URLSearchParams("state=archived")).states).toEqual(["unread"]);
    expect(parseInboxFilters(new URLSearchParams("state=DONE")).states).toEqual(["unread"]);
  });

  // The age buckets are a closed set, because each one is a different query
  // on the server.
  test("the age filter accepts only the known buckets", () => {
    for (const age of AGE_VALUES.filter((a) => a !== "all")) {
      expect(parseInboxFilters(new URLSearchParams(`age=${age}`)).ages).toEqual([age]);
    }
    expect(parseInboxFilters(new URLSearchParams("age=all")).ages).toEqual([]);
    expect(parseInboxFilters(new URLSearchParams("age=3d")).ages).toEqual([]);
    expect(parseInboxFilters(new URLSearchParams("age=90d")).ages).toEqual([]);
    expect(parseInboxFilters(new URLSearchParams("age=24H")).ages).toEqual([]);
  });

  // The repository and the type are free-form: the repository is an
  // identifier the server hands out, the type is a notification reason.
  test("the repository and the type are free-form strings", () => {
    expect(parseInboxFilters(new URLSearchParams("repo=acme--web")).repos).toEqual([
      "acme--web",
    ]);
    expect(
      parseInboxFilters(new URLSearchParams("type=security_advisory")).types
    ).toEqual(["security_advisory"]);
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
    expect(serializeInboxFilters({ ...DEFAULTS, repos: ["acme--web"] })).toBe(
      "?repo=acme--web"
    );
    expect(serializeInboxFilters({ ...DEFAULTS, states: ["done"] })).toBe("?state=done");
    expect(serializeInboxFilters({ ...DEFAULTS, types: ["merged"] })).toBe("?type=merged");
    expect(serializeInboxFilters({ ...DEFAULTS, ages: ["30d"] })).toBe("?age=30d");
  });

  // The parameter order is fixed, so two equal filter sets always produce
  // the same URL.
  test("the parameters keep a stable order", () => {
    const query = serializeInboxFilters({
      repos: ["acme--web"],
      states: ["unread", "done"],
      types: ["merged"],
      ages: ["year"],
    });
    expect(query).toBe("?repo=acme--web&state=all&type=merged&age=year");
  });

  // Both states serialize as the compact legacy ?state=all alias.
  test("both states serialize as state=all", () => {
    expect(
      serializeInboxFilters({ ...DEFAULTS, states: ["unread", "done"] })
    ).toBe("?state=all");
  });

  test("several repos serialize as repeated params", () => {
    expect(serializeInboxFilters({ ...DEFAULTS, repos: ["b", "a"] })).toBe(
      "?repo=a&repo=b"
    );
  });
});

describe("multi-select toggle helpers", () => {
  test("toggleInList adds and removes in sorted order", () => {
    expect(toggleInList([], "b")).toEqual(["b"]);
    expect(toggleInList(["b", "a"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleInList(["a", "b"], "a")).toEqual(["b"]);
  });

  test("toggleState keeps at least one state selected", () => {
    expect(toggleState(["unread"], "done")).toEqual(["unread", "done"]);
    expect(toggleState(["unread", "done"], "unread")).toEqual(["done"]);
    expect(toggleState(["done"], "done")).toEqual(["done"]);
  });

  test("toggleAge clears the whole group on all", () => {
    expect(toggleAge(["7d"], "all")).toEqual([]);
    expect(toggleAge([], "7d")).toEqual(["7d"]);
    expect(toggleAge(["7d"], "7d")).toEqual([]);
  });
});

describe("multi-select display helpers", () => {
  const one: InboxFilters = { repos: ["a"], states: ["done"], types: ["t"], ages: ["7d"] };

  test("empty lists mean all, states default to unread", () => {
    expect(isAllRepos(DEFAULTS)).toBe(true);
    expect(isAllTypes(DEFAULTS)).toBe(true);
    expect(isAllAges(DEFAULTS)).toBe(true);
    expect(isAllRepos(one)).toBe(false);
    expect(displayState(DEFAULTS)).toBe("unread");
    expect(displayState({ ...DEFAULTS, states: ["done"] })).toBe("done");
    expect(displayState({ ...DEFAULTS, states: ["unread", "done"] })).toBe("all");
  });

  test("state predicates partition the sets", () => {
    expect(isUnreadOnly(DEFAULTS)).toBe(true);
    expect(isDoneOnly(DEFAULTS)).toBe(false);
    expect(isAllStates(DEFAULTS)).toBe(false);
    expect(isDoneOnly({ ...DEFAULTS, states: ["done"] })).toBe(true);
    expect(isAllStates({ ...DEFAULTS, states: ["unread", "done"] })).toBe(true);
  });

  test("equality ignores order", () => {
    expect(statesEqual(["done", "unread"], ["unread", "done"])).toBe(true);
    expect(statesEqual(["unread"], ["done"])).toBe(false);
    expect(
      filtersEqual(
        { repos: ["b", "a"], states: ["done", "unread"], types: [], ages: [] },
        { repos: ["a", "b"], states: ["unread", "done"], types: [], ages: [] }
      )
    ).toBe(true);
    expect(filtersEqual(DEFAULTS, one)).toBe(false);
  });

  test("repoFilterHref sets a single repo or clears", () => {
    expect(repoFilterHref("?type=mention", "acme--web")).toBe("/?repo=acme--web&type=mention");
    expect(repoFilterHref("?repo=acme--web", "all")).toBe("/");
  });

  test("normalizeInboxFilters rejects a non-object", () => {
    expect(normalizeInboxFilters(42)).toEqual(DEFAULTS);
    expect(normalizeInboxFilters(null)).toEqual(DEFAULTS);
  });
});

describe("the filter round trip", () => {
  // A link that is copied out of the inbox has to reproduce the same
  // filters when it is opened again.
  test("every filter survives a serialize and parse cycle", () => {
    const filters: InboxFilters = {
      repos: ["acme--web"],
      states: ["done"],
      types: ["pull_request"],
      ages: ["48h"],
    };
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query))).toEqual(filters);
  });

  test("multi-value filters survive a serialize and parse cycle", () => {
    const filters: InboxFilters = {
      repos: ["a", "b"],
      states: ["unread", "done"],
      types: ["assign", "mention"],
      ages: ["7d", "30d"],
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

  // The explicit "all" state is written and read back as both states.
  test("the explicit all state survives the cycle", () => {
    const filters: InboxFilters = { ...DEFAULTS, states: ["unread", "done"] };
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query))).toEqual(filters);
  });

  // A value that the filter set does not know is normalised on the way
  // back in, so a hand-edited URL cannot reach the query.
  test("an unknown state in the query string is normalised to unread", () => {
    const filters = { ...DEFAULTS, states: ["archived"] } as unknown as InboxFilters;
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query)).states).toEqual(["unread"]);
  });

  // An empty repository name is not a repository, so it reads back as the
  // default empty set.
  test("an empty repository name falls back to the default", () => {
    const filters: InboxFilters = { ...DEFAULTS, repos: [""] };
    const query = serializeInboxFilters(filters);
    expect(parseInboxFilters(new URLSearchParams(query)).repos).toEqual([]);
  });
});

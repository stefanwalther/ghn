import { describe, expect, test } from "vitest";
import { serve } from "../support/http-stub";
import {
  fetchRelease,
  isReleaseApiUrl,
  parseReleaseTagFromHtml,
  releaseApiUrlFromHtml,
  releaseBadgeKind,
} from "@/lib/github";

describe("parseReleaseTagFromHtml", () => {
  test("parses owner, repo and tag from a release tag page", () => {
    expect(
      parseReleaseTagFromHtml(
        "https://github.com/pingdotgg/t3code/releases/tag/v0.1.8-nightly.20261107.4301"
      )
    ).toEqual({
      owner: "pingdotgg",
      repo: "t3code",
      tag: "v0.1.8-nightly.20261107.4301",
    });
  });

  test("keeps nested tags with slashes intact", () => {
    expect(
      parseReleaseTagFromHtml("https://github.com/acme/web/releases/tag/nightly/2026.11.07")
    ).toEqual({ owner: "acme", repo: "web", tag: "nightly/2026.11.07" });
  });

  test("returns null for the releases index page without a tag", () => {
    expect(parseReleaseTagFromHtml("https://github.com/acme/web/releases")).toBeNull();
  });

  test("returns null for issue and pull urls", () => {
    expect(parseReleaseTagFromHtml("https://github.com/acme/web/pull/12")).toBeNull();
    expect(parseReleaseTagFromHtml("https://github.com/acme/web/issues/34")).toBeNull();
  });

  test("returns null for garbage input", () => {
    expect(parseReleaseTagFromHtml("not a url")).toBeNull();
    expect(parseReleaseTagFromHtml("")).toBeNull();
  });
});

describe("releaseApiUrlFromHtml", () => {
  test("maps a release tag page to the get-by-tag endpoint", () => {
    const prior = process.env.GHN_API_BASE;
    process.env.GHN_API_BASE = "http://stand-in.local";
    try {
      expect(
        releaseApiUrlFromHtml("https://github.com/acme/web/releases/tag/v9.9.9")
      ).toBe("http://stand-in.local/repos/acme/web/releases/tags/v9.9.9");
    } finally {
      if (prior === undefined) delete process.env.GHN_API_BASE;
      else process.env.GHN_API_BASE = prior;
    }
  });

  test("returns null when no tag can be parsed", () => {
    expect(releaseApiUrlFromHtml("https://github.com/acme/web/releases")).toBeNull();
    expect(releaseApiUrlFromHtml("https://github.com/acme/web/pull/12")).toBeNull();
  });
});

describe("isReleaseApiUrl", () => {
  test("recognises release endpoints by id and by tag", () => {
    expect(isReleaseApiUrl("https://api.github.com/repos/acme/web/releases/123")).toBe(true);
    expect(
      isReleaseApiUrl("https://api.github.com/repos/acme/web/releases/tags/v9.9.9")
    ).toBe(true);
  });

  test("rejects pulls, issues and unrelated paths", () => {
    expect(isReleaseApiUrl("https://api.github.com/repos/acme/web/pulls/1")).toBe(false);
    expect(isReleaseApiUrl("https://api.github.com/repos/acme/web/issues/1")).toBe(false);
    expect(isReleaseApiUrl("https://api.github.com/repos/acme/web")).toBe(false);
  });
});

describe("fetchRelease", () => {
  const payload = {
    tag_name: "v9.9.9",
    name: "Release v9.9.9",
    body: "Changes in this release.",
    draft: false,
    prerelease: true,
    author: { login: "github-actions" },
    html_url: "https://github.com/acme/web/releases/tag/v9.9.9",
    published_at: "2026-01-14T12:00:00Z",
    created_at: "2026-01-14T11:00:00Z",
    target_commitish: "4cb6945",
    assets: [
      {
        name: "nightly-mac.yml",
        size: 786,
        browser_download_url: "https://github.com/acme/web/releases/download/v9.9.9/nightly-mac.yml",
      },
    ],
  };

  test("projects the release detail shape", async () => {
    const server = await serve({
      fetch: () =>
        new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
        }),
    });
    try {
      const release = await fetchRelease("token", `${server.url}/repos/acme/web/releases/1`);
      expect(release).toEqual({
        name: "Release v9.9.9",
        tagName: "v9.9.9",
        body: "Changes in this release.",
        draft: false,
        prerelease: true,
        authorLogin: "github-actions",
        publishedAt: Date.parse("2026-01-14T12:00:00Z"),
        htmlUrl: "https://github.com/acme/web/releases/tag/v9.9.9",
        targetRef: "4cb6945",
        assets: [
          {
            name: "nightly-mac.yml",
            size: 786,
            downloadUrl:
              "https://github.com/acme/web/releases/download/v9.9.9/nightly-mac.yml",
          },
        ],
      });
    } finally {
      await server.stop(true);
    }
  });

  test("returns null when the release is gone", async () => {
    const server = await serve({
      fetch: () => new Response(JSON.stringify({ error: "Not Found" }), { status: 404 }),
    });
    try {
      await expect(
        fetchRelease("token", `${server.url}/repos/acme/web/releases/1`)
      ).resolves.toBeNull();
    } finally {
      await server.stop(true);
    }
  });

  test("returns null when the payload has no usable tag", async () => {
    const server = await serve({
      fetch: () =>
        new Response(JSON.stringify({ ...payload, tag_name: "" }), {
          headers: { "Content-Type": "application/json" },
        }),
    });
    try {
      await expect(
        fetchRelease("token", `${server.url}/repos/acme/web/releases/1`)
      ).resolves.toBeNull();
    } finally {
      await server.stop(true);
    }
  });

  test("coerces missing bodies and asset gaps to the documented defaults", async () => {
    const server = await serve({
      fetch: () =>
        new Response(
          JSON.stringify({
            ...payload,
            body: "",
            author: null,
            published_at: null,
            created_at: "not a date",
            target_commitish: null,
            assets: [{ size: 12 }, "junk", { name: "a.yml", size: null }],
          }),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const release = await fetchRelease("token", `${server.url}/repos/acme/web/releases/1`);
      expect(release?.body).toBeNull();
      expect(release?.authorLogin).toBeNull();
      expect(release?.publishedAt).toBeNull();
      expect(release?.targetRef).toBeNull();
      expect(release?.assets).toEqual([{ name: "a.yml", size: null, downloadUrl: null }]);
    } finally {
      await server.stop(true);
    }
  });

  test("coerces a non-array assets payload to an empty list", async () => {
    const server = await serve({
      fetch: () =>
        new Response(JSON.stringify({ ...payload, assets: null }), {
          headers: { "Content-Type": "application/json" },
        }),
    });
    try {
      const release = await fetchRelease("token", `${server.url}/repos/acme/web/releases/1`);
      expect(release?.assets).toEqual([]);
    } finally {
      await server.stop(true);
    }
  });
});

describe("releaseBadgeKind", () => {
  test("a draft shows draft even when also marked pre-release", () => {
    expect(releaseBadgeKind({ draft: true, prerelease: true })).toBe("draft");
  });

  test("a pre-release shows pre-release", () => {
    expect(releaseBadgeKind({ draft: false, prerelease: true })).toBe("pre-release");
  });

  test("a final release shows no badge", () => {
    expect(releaseBadgeKind({ draft: false, prerelease: false })).toBeNull();
  });
});

describe("asset projection rules", () => {
  test("applies the documented asset constraints verbatim", async () => {
    const server = await serve({
      fetch: () =>
        new Response(
          JSON.stringify({
            tag_name: "v1.0.0",
            html_url: "https://github.com/acme/web/releases/tag/v1.0.0",
            assets: [
              { name: "full.bin", size: 2048, browser_download_url: "https://example.com/full.bin" },
              { name: "nosize.bin" },
              { size: 10 },
              null,
            ],
          }),
          { headers: { "Content-Type": "application/json" } }
        ),
    });
    try {
      const release = await fetchRelease("token", `${server.url}/repos/acme/web/releases/9`);
      // "non-array assets coerces to []" does not apply here; the list form applies:
      // "entries without a name are skipped", rows with absent size/downloadUrl show the name only.
      expect(release?.assets).toEqual([
        { name: "full.bin", size: 2048, downloadUrl: "https://example.com/full.bin" },
        { name: "nosize.bin", size: null, downloadUrl: null },
      ]);
    } finally {
      await server.stop(true);
    }
  });
});

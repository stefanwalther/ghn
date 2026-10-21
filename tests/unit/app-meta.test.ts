import { describe, expect, test } from "bun:test";
import packageJson from "../../package.json";
import { APP_VERSION, GITHUB_REPO_URL } from "@/lib/app-meta";

describe("app meta", () => {
  test("version tracks package.json and looks like semver", () => {
    expect(APP_VERSION).toBe(packageJson.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("repo url points at the ghn repository", () => {
    expect(GITHUB_REPO_URL).toBe("https://github.com/stefanwalther/ghn");
  });
});

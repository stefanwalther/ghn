import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expandPath,
  getConfigPath,
  getDefaultDatabasePath,
  getLegacyDatabasePath,
  getWorktreeDatabasePath,
  getWorktreeSlug,
  isExplicitDatabasePath,
  loadFileConfig,
  migrateLegacyDatabase,
  resolveDatabasePath,
} from "@/lib/config";

const HOME = "/tmp/ghn-test-home";
const CWD = "/tmp/ghn-test-cwd";

afterEach(() => {
  delete process.env.GHN_DB_PATH;
  delete process.env.GHN_CONFIG_PATH;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_DATA_HOME;
});

describe("getConfigPath", () => {
  test("defaults to ~/.config/ghn/config.json", () => {
    expect(getConfigPath({}, HOME)).toBe(path.join(HOME, ".config", "ghn", "config.json"));
  });

  test("respects XDG_CONFIG_HOME", () => {
    expect(getConfigPath({ XDG_CONFIG_HOME: "/xdg" }, HOME)).toBe(
      path.join("/xdg", "ghn", "config.json")
    );
  });

  test("GHN_CONFIG_PATH wins and expands ~", () => {
    expect(
      getConfigPath({ GHN_CONFIG_PATH: "~/custom/ghn.json" }, HOME)
    ).toBe(path.join(HOME, "custom", "ghn.json"));
  });
});

describe("expandPath", () => {
  test("expands ~, $VAR and ${VAR}", () => {
    expect(expandPath("~/db.sqlite", {}, HOME)).toBe(path.join(HOME, "db.sqlite"));
    expect(expandPath("$DROP/g.db", { DROP: "/drop" }, HOME)).toBe("/drop/g.db");
    expect(expandPath("${DROP}/g.db", { DROP: "/drop" }, HOME)).toBe("/drop/g.db");
  });

  test("unknown $VAR throws naming the variable", () => {
    expect(() => expandPath("$MISSING/g.db", {}, HOME)).toThrow("$MISSING");
    expect(() =>
      resolveDatabasePath({
        env: {},
        homeDir: HOME,
        cwd: CWD,
        fileConfig: { databasePath: "$MISSING/g.db" },
        configPath: "/cfg/config.json",
      })
    ).toThrow("$MISSING");
  });
});

describe("resolveDatabasePath", () => {
  test("falls back to ~/.local/share/ghn/ghn.db", () => {
    expect(resolveDatabasePath({ env: {}, homeDir: HOME, cwd: CWD })).toBe(
      path.join(HOME, ".local", "share", "ghn", "ghn.db")
    );
  });

  test("getDefaultDatabasePath respects XDG_DATA_HOME", () => {
    expect(getDefaultDatabasePath({ XDG_DATA_HOME: "/xdg-data" }, HOME, CWD)).toBe(
      path.join("/xdg-data", "ghn", "ghn.db")
    );
  });

  test("getDefaultDatabasePath ignores relative XDG_DATA_HOME", () => {
    expect(getDefaultDatabasePath({ XDG_DATA_HOME: "data" }, HOME, CWD)).toBe(
      path.join(HOME, ".local", "share", "ghn", "ghn.db")
    );
  });

  test("getDefaultDatabasePath treats XDG_DATA_HOME literally", () => {
    expect(
      getDefaultDatabasePath({ XDG_DATA_HOME: "/xdg/$LITERAL" }, HOME, CWD)
    ).toBe(path.join("/xdg/$LITERAL", "ghn", "ghn.db"));
  });

  test("getDefaultDatabasePath isolates linked worktrees", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghn-wt-"));
    const main = path.join(dir, "main");
    fs.mkdirSync(main);
    execFileSync("git", ["init"], { cwd: main, stdio: "ignore" });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=t@t.example",
        "-c",
        "user.name=t",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-m",
        "init",
      ],
      { cwd: main, stdio: "ignore" }
    );
    const wt = path.join(dir, "wt");
    execFileSync("git", ["worktree", "add", wt], { cwd: main, stdio: "ignore" });
    const env = { GIT_CEILING_DIRECTORIES: dir };
    const slug = getWorktreeSlug(wt, env);
    expect(slug).toMatch(/^wt-[0-9a-f]{12}$/);
    expect(getWorktreeSlug(main, env)).toBeNull();
    expect(getDefaultDatabasePath({}, HOME, wt)).toContain(
      path.join(".local", "share", "ghn", "worktrees")
    );
    expect(getWorktreeDatabasePath(HOME, slug as string, {})).toBe(
      path.join(HOME, ".local", "share", "ghn", "worktrees", slug as string, "ghn.db")
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("getWorktreeSlug is null outside a repository", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghn-plain-"));
    expect(getWorktreeSlug(dir, { GIT_CEILING_DIRECTORIES: dir })).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("isExplicitDatabasePath reports overrides", () => {
    expect(isExplicitDatabasePath({ env: { GHN_DB_PATH: "/env.db" } })).toBe(true);
    expect(
      isExplicitDatabasePath({
        env: {},
        fileConfig: { databasePath: "/cfg.db" },
        configPath: "/cfg/config.json",
      })
    ).toBe(true);
    expect(
      isExplicitDatabasePath({
        env: {},
        fileConfig: {},
        configPath: "/cfg/config.json",
      })
    ).toBe(false);
  });

  test("migrateLegacyDatabase copies once and never overwrites", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghn-mig-"));
    const home = path.join(dir, "home");
    const dest = path.join(home, ".local", "share", "ghn", "ghn.db");
    const legacy = path.join(dir, "checkout", "data", "ghn.db");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "legacy-bytes");
    const cwd = path.join(dir, "checkout");
    expect(getLegacyDatabasePath(cwd)).toBe(legacy);
    expect(migrateLegacyDatabase(dest, cwd)).toBe(true);
    expect(fs.readFileSync(dest, "utf-8")).toBe("legacy-bytes");
    fs.writeFileSync(legacy, "changed-bytes");
    expect(migrateLegacyDatabase(dest, cwd)).toBe(false);
    expect(fs.readFileSync(dest, "utf-8")).toBe("legacy-bytes");
    expect(migrateLegacyDatabase(dest, path.join(dir, "empty"))).toBe(false);
    expect(migrateLegacyDatabase(legacy, cwd)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("GHN_DB_PATH wins over config file", () => {
    expect(
      resolveDatabasePath({
        env: { GHN_DB_PATH: "/env/db.sqlite" },
        homeDir: HOME,
        cwd: CWD,
        fileConfig: { databasePath: "/cfg/db.sqlite" },
        configPath: "/cfg/config.json",
      })
    ).toBe("/env/db.sqlite");
  });

  test("config databasePath supports ~/ expansion", () => {
    expect(
      resolveDatabasePath({
        env: {},
        homeDir: HOME,
        cwd: CWD,
        fileConfig: { databasePath: "~/Dropbox/ghn/ghn.db" },
        configPath: path.join(HOME, ".config", "ghn", "config.json"),
      })
    ).toBe(path.join(HOME, "Dropbox", "ghn", "ghn.db"));
  });

  test("relative config path resolves against cwd", () => {
    expect(
      resolveDatabasePath({
        env: {},
        homeDir: HOME,
        cwd: CWD,
        fileConfig: { databasePath: "data/custom.db" },
        configPath: "/cfg/config.json",
      })
    ).toBe(path.join(CWD, "data", "custom.db"));
  });

  test("dbPath alias is accepted", () => {
    expect(
      resolveDatabasePath({
        env: {},
        homeDir: HOME,
        cwd: CWD,
        fileConfig: { dbPath: "/alias/db.sqlite" },
        configPath: "/cfg/config.json",
      })
    ).toBe("/alias/db.sqlite");
  });
});

describe("loadFileConfig", () => {
  test("missing file returns {}", () => {
    expect(loadFileConfig(path.join(HOME, "does-not-exist.json"))).toEqual({});
  });

  test("invalid JSON throws with path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghn-config-"));
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, "{not json", "utf-8");
    expect(() => loadFileConfig(file)).toThrow(file);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

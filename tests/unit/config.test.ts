import { afterEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expandPath,
  getConfigPath,
  loadFileConfig,
  resolveDatabasePath,
} from "@/lib/config";

const HOME = "/tmp/ghn-test-home";
const CWD = "/tmp/ghn-test-cwd";

afterEach(() => {
  delete process.env.GHN_DB_PATH;
  delete process.env.GHN_CONFIG_PATH;
  delete process.env.XDG_CONFIG_HOME;
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
  test("falls back to ./data/ghn.db under cwd", () => {
    expect(resolveDatabasePath({ env: {}, homeDir: HOME, cwd: CWD })).toBe(
      path.resolve(CWD, "./data/ghn.db")
    );
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

  test("config databasePath supports Dropbox-style ~/ expansion", () => {
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

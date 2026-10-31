import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "ghn";
export const CONFIG_FILENAME = "config.json";
export const DB_FILENAME = "ghn.db";
/** Predecessor default, kept for one-time upgrade migration. */
export const LEGACY_DB_RELATIVE = "./data/ghn.db";

export interface FileConfig {
  databasePath?: string;
  /** Accepted alias for databasePath. */
  dbPath?: string;
}

export interface ResolvedConfig {
  configPath: string;
  databasePath: string;
}

export type Env = Record<string, string | undefined>;

function expandEnvVars(input: string, env: Env): string {
  return input.replace(/\$(\w+)|\$\{([^}]+)\}/g, (match: string, name1: string, name2: string) => {
    const name = name1 ?? name2;
    const value = env[name];
    if (value === undefined) {
      throw new Error(`Unknown environment variable $${name} in path "${input}"`);
    }
    return value;
  });
}

export function expandPath(
  input: string,
  env: Env = process.env,
  homeDir: string = os.homedir()
): string {
  let out = input.trim();
  if (out.startsWith("~")) {
    out = homeDir + out.slice(1);
  }
  out = expandEnvVars(out, env);
  return out;
}

export function getConfigPath(
  env: Env = process.env,
  homeDir: string = os.homedir()
): string {
  const override = env.GHN_CONFIG_PATH?.trim();
  if (override) {
    const expanded = expandPath(override, env, homeDir);
    return path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded);
  }
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) {
    return path.join(expandPath(xdg, env, homeDir), APP_NAME, CONFIG_FILENAME);
  }
  return path.join(homeDir, ".config", APP_NAME, CONFIG_FILENAME);
}

export function loadFileConfig(configPath: string): FileConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as FileConfig;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("config must be a JSON object");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid JSON in ${configPath}: ${(err as Error).message}`);
  }
}

function pickDatabaseRaw(fileConfig: FileConfig): string | undefined {
  const candidate = fileConfig.databasePath ?? fileConfig.dbPath;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  return undefined;
}

function getDataBaseDir(env: Env, homeDir: string): string {
  const xdg = env.XDG_DATA_HOME?.trim();
  if (xdg && path.isAbsolute(xdg)) {
    return path.join(xdg, APP_NAME);
  }
  return path.join(homeDir, ".local", "share", APP_NAME);
}

/**
 * Worktree slug for per-checkout database isolation, or null outside a
 * linked worktree. The main checkout shares the user-level database;
 * linked worktrees get `worktrees/<slug>/ghn.db` so `db:seed` in one
 * checkout cannot wipe another.
 */
export function getWorktreeSlug(
  cwd: string = process.cwd(),
  env: Env = process.env
): string | null {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  let top: string;
  try {
    top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      env: childEnv,
    }).trim();
  } catch {
    return null;
  }
  let gitEntry: fs.Stats;
  try {
    gitEntry = fs.statSync(path.join(top, ".git"));
  } catch {
    return null;
  }
  if (!gitEntry.isFile()) return null;
  const digest = createHash("sha256").update(top).digest("hex").slice(0, 12);
  return `${path.basename(top)}-${digest}`;
}

export function getWorktreeDatabasePath(
  homeDir: string,
  slug: string,
  env: Env = process.env
): string {
  const base = getDataBaseDir(env, homeDir);
  return path.join(base, "worktrees", slug, DB_FILENAME);
}

export function getDefaultDatabasePath(
  env: Env = process.env,
  homeDir: string = os.homedir(),
  cwd: string = process.cwd()
): string {
  const slug = getWorktreeSlug(cwd, env);
  if (slug) return getWorktreeDatabasePath(homeDir, slug, env);
  const base = getDataBaseDir(env, homeDir);
  return path.join(base, DB_FILENAME);
}

/** Absolute path of the predecessor per-checkout default. */
export function getLegacyDatabasePath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, LEGACY_DB_RELATIVE);
}

/** True when the database path comes from GHN_DB_PATH or the config file. */
export function isExplicitDatabasePath(
  opts: {
    env?: Env;
    homeDir?: string;
    configPath?: string;
    fileConfig?: FileConfig;
  } = {}
): boolean {
  const env = opts.env ?? process.env;
  if (env.GHN_DB_PATH?.trim()) return true;
  const homeDir = opts.homeDir ?? os.homedir();
  const configPath = opts.configPath ?? getConfigPath(env, homeDir);
  const fileConfig = opts.fileConfig ?? loadFileConfig(configPath);
  return pickDatabaseRaw(fileConfig) !== undefined;
}

/**
 * One-time upgrade copy from the legacy per-checkout database. Copies only
 * when the destination is missing and a legacy file exists; never
 * overwrites. Returns true when a copy happened.
 */
export function migrateLegacyDatabase(
  destination: string,
  cwd: string = process.cwd()
): boolean {
  const legacy = getLegacyDatabasePath(cwd);
  if (destination === legacy) return false;
  try {
    if (fs.statSync(destination).isFile()) return false;
  } catch {
    // Destination missing; fall through to the legacy check.
  }
  let legacyStat: fs.Stats;
  try {
    legacyStat = fs.statSync(legacy);
  } catch {
    return false;
  }
  if (!legacyStat.isFile()) return false;
  ensureParentDir(destination);
  fs.copyFileSync(legacy, destination);
  for (const suffix of ["-wal", "-shm"]) {
    try {
      if (fs.statSync(legacy + suffix).isFile()) {
        fs.copyFileSync(legacy + suffix, destination + suffix);
      }
    } catch {
      // Companion file absent; nothing to copy.
    }
  }
  return true;
}

export function resolveDatabasePath(
  opts: {
    env?: Env;
    homeDir?: string;
    configPath?: string;
    fileConfig?: FileConfig;
    cwd?: string;
  } = {}
): string {
  const env = opts.env ?? process.env;
  const homeDir = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();

  const envOverride = env.GHN_DB_PATH?.trim();
  if (envOverride) {
    const expanded = expandPath(envOverride, env, homeDir);
    return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  }

  const configPath = opts.configPath ?? getConfigPath(env, homeDir);
  const fileConfig = opts.fileConfig ?? loadFileConfig(configPath);
  const raw = pickDatabaseRaw(fileConfig);
  if (raw) {
    const expanded = expandPath(raw, env, homeDir);
    return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  }

  return getDefaultDatabasePath(env, homeDir, cwd);
}

export function getDatabasePath(): string {
  return resolveDatabasePath();
}

export function getResolvedConfig(): ResolvedConfig {
  const configPath = getConfigPath();
  return { configPath, databasePath: resolveDatabasePath({ configPath }) };
}

export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

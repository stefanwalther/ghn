import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "ghn";
export const CONFIG_FILENAME = "config.json";
export const DB_FILENAME = "ghn.db";

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

export function getDefaultDatabasePath(
  env: Env = process.env,
  homeDir: string = os.homedir()
): string {
  const xdg = env.XDG_DATA_HOME?.trim();
  if (xdg) {
    return path.join(expandPath(xdg, env, homeDir), APP_NAME, DB_FILENAME);
  }
  return path.join(homeDir, ".local", "share", APP_NAME, DB_FILENAME);
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

  return getDefaultDatabasePath(env, homeDir);
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

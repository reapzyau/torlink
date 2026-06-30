import { promises as fs } from "node:fs";
import { configFile, defaultDownloadDir } from "./paths";
import { DEFAULT_TRACKERS } from "../sources/magnet";
import { serializeWrites, writeJsonAtomic } from "../util/atomic";

export interface Config {
  downloadDir: string;
  // BitTorrent tracker announce URLs added to every download. Edit the
  // `trackers` array in config.json to use your own (public or private). An
  // empty/invalid list falls back to the shipped defaults.
  trackers: string[];
}

export const defaultConfig: Config = {
  downloadDir: defaultDownloadDir,
  trackers: [...DEFAULT_TRACKERS],
};

// Accept only a non-empty array of non-blank strings; anything else (missing
// key, wrong type, all-blank) falls back to the shipped defaults so a download
// is never left with zero trackers.
function sanitizeTrackers(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_TRACKERS];
  const cleaned = value.filter(
    (t): t is string => typeof t === "string" && t.trim().length > 0,
  );
  return cleaned.length > 0 ? cleaned : [...DEFAULT_TRACKERS];
}

export async function loadConfig(): Promise<Config> {
  let raw: string;
  try {
    raw = await fs.readFile(configFile, "utf8");
  } catch {
    return { ...defaultConfig, trackers: [...DEFAULT_TRACKERS] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Config>;
    const cfg = { ...defaultConfig, ...parsed };
    if (!cfg.downloadDir || typeof cfg.downloadDir !== "string") {
      cfg.downloadDir = defaultDownloadDir;
    }
    cfg.trackers = sanitizeTrackers(parsed.trackers);
    return cfg;
  } catch {
    return { ...defaultConfig, trackers: [...DEFAULT_TRACKERS] };
  }
}

const write = serializeWrites();

export function saveConfig(config: Config): Promise<void> {
  return write(() => writeJsonAtomic(configFile, config));
}

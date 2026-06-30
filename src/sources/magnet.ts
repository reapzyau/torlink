// The trackers torlink ships with. Used as the default when the user's config
// has none, and as the fallback if a config supplies an empty/invalid list.
export const DEFAULT_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.dler.org:6969/announce",
];

// The active tracker list — the single source of truth. Seeded from the user's
// config at startup (setTrackers) and read by both buildMagnet (the tr= params
// on magnets we construct) and the download engine (the announce list merged
// into every torrent it adds). Defaults to DEFAULT_TRACKERS so behaviour is
// unchanged until a config overrides it.
let activeTrackers: string[] = [...DEFAULT_TRACKERS];

// Replace the active tracker list. An empty list is ignored and the shipped
// defaults are kept, so a malformed config can never strand downloads with zero
// trackers to announce to.
export function setTrackers(trackers: string[]): void {
  activeTrackers = trackers.length > 0 ? [...trackers] : [...DEFAULT_TRACKERS];
}

export function getTrackers(): string[] {
  return activeTrackers;
}

export function buildMagnet(infoHash: string, name: string): string {
  const dn = encodeURIComponent(name);
  const tr = activeTrackers.map((t) => `&tr=${encodeURIComponent(t)}`).join("");
  return `magnet:?xt=urn:btih:${infoHash}&dn=${dn}${tr}`;
}

const MAGNET_RE = /xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ToHex(b32: string): string | null {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const c of b32.toUpperCase()) {
    const idx = BASE32.indexOf(c);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out += ((value >>> bits) & 0xff).toString(16).padStart(2, "0");
      value &= (1 << bits) - 1;
    }
  }
  return out.length === 40 ? out : null;
}

export function normalizeInfoHash(raw: string): string {
  return raw.length === 32 ? (base32ToHex(raw) ?? raw.toLowerCase()) : raw.toLowerCase();
}

export interface ParsedMagnet {
  infoHash: string;
  name: string;
  magnet: string;
}

export function parseMagnet(input: string): ParsedMagnet | null {
  const s = input.trim();
  if (!/^magnet:\?/i.test(s)) return null;
  const m = MAGNET_RE.exec(s);
  if (!m) return null;
  const infoHash = normalizeInfoHash(m[1]!);
  let name = infoHash;
  try {
    const dn = new URL(s).searchParams.get("dn");
    if (dn) name = dn;
  } catch {}
  return { infoHash, name, magnet: s };
}

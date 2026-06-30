import { describe, it, expect, afterEach } from "vitest";
import {
  parseMagnet,
  normalizeInfoHash,
  buildMagnet,
  setTrackers,
  getTrackers,
  DEFAULT_TRACKERS,
} from "./magnet";

describe("parseMagnet", () => {
  it("keeps a full 40-char hex info hash", () => {
    const hash = "abcdef0123456789abcdef0123456789abcdef01";
    const m = parseMagnet(`magnet:?xt=urn:btih:${hash}&dn=Cool+Movie`);
    expect(m?.infoHash).toBe(hash);
    expect(m?.infoHash.length).toBe(40);
    expect(m?.name).toBe("Cool Movie");
  });

  it("decodes a 32-char base32 hash to 40-char hex", () => {
    const m = parseMagnet("magnet:?xt=urn:btih:MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U&dn=X");
    expect(m?.infoHash.length).toBe(40);
    expect(m?.infoHash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("falls back to the hash as the name when dn is absent", () => {
    const hash = "abcdef0123456789abcdef0123456789abcdef01";
    const m = parseMagnet(`magnet:?xt=urn:btih:${hash}`);
    expect(m?.name).toBe(hash);
  });

  it("returns null for non-magnets and malformed hashes", () => {
    expect(parseMagnet("not a magnet")).toBeNull();
    expect(parseMagnet("magnet:?xt=urn:btih:tooshort")).toBeNull();
    expect(parseMagnet("prefix magnet:?xt=urn:btih:" + "a".repeat(40))).toBeNull();
  });
});

describe("normalizeInfoHash", () => {
  it("lowercases 40-char hex", () => {
    expect(normalizeInfoHash("ABCDEF0123456789ABCDEF0123456789ABCDEF01")).toBe(
      "abcdef0123456789abcdef0123456789abcdef01",
    );
  });
  it("decodes 32-char base32 to 40-char hex", () => {
    expect(normalizeInfoHash("MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U")).toMatch(/^[a-f0-9]{40}$/);
  });
});

describe("buildMagnet", () => {
  it("builds a magnet with encoded name and trackers", () => {
    const out = buildMagnet("abc123", "My Movie 2024");
    expect(out).toContain("xt=urn:btih:abc123");
    expect(out).toContain("dn=My%20Movie%202024");
    expect(out).toContain("&tr=");
  });
});

describe("configurable trackers", () => {
  afterEach(() => setTrackers(DEFAULT_TRACKERS));

  it("defaults to the shipped tracker list", () => {
    expect(getTrackers()).toEqual(DEFAULT_TRACKERS);
  });

  it("buildMagnet uses the active (configured) tracker list", () => {
    const custom = "udp://my.tracker.example:1337/announce";
    setTrackers([custom]);
    const out = buildMagnet("abc123", "X");
    expect(out).toContain(`&tr=${encodeURIComponent(custom)}`);
    expect(out).not.toContain(encodeURIComponent(DEFAULT_TRACKERS[0]!));
  });

  it("ignores an empty list and keeps the defaults", () => {
    setTrackers([]);
    expect(getTrackers()).toEqual(DEFAULT_TRACKERS);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPrivateTorrentSource } from "./engine";

// Minimal bencoded info dicts. The detector only cares whether the private
// flag token `7:privatei1e` is present, so these stand in for real .torrent
// files without needing a full encoder.
const PRIVATE_TORRENT =
  "d4:infod6:lengthi1e4:name1:a12:piece lengthi16384e6:pieces20:aaaaaaaaaaaaaaaaaaaa7:privatei1eee";
const PUBLIC_TORRENT =
  "d4:infod6:lengthi1e4:name1:a12:piece lengthi16384e6:pieces20:aaaaaaaaaaaaaaaaaaaaee";
const PUBLIC_TORRENT_EXPLICIT =
  "d4:infod6:lengthi1e4:name1:a12:piece lengthi16384e6:pieces20:aaaaaaaaaaaaaaaaaaaa7:privatei0eee";

describe("isPrivateTorrentSource", () => {
  const dirs: string[] = [];

  function writeTorrent(contents: string): string {
    const dir = mkdtempSync(join(tmpdir(), "torlink-engine-"));
    dirs.push(dir);
    const file = join(dir, "x.torrent");
    writeFileSync(file, Buffer.from(contents));
    return file;
  }

  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("flags a private .torrent file", () => {
    expect(isPrivateTorrentSource(writeTorrent(PRIVATE_TORRENT))).toBe(true);
  });

  it("does not flag a public .torrent file (flag absent)", () => {
    expect(isPrivateTorrentSource(writeTorrent(PUBLIC_TORRENT))).toBe(false);
  });

  it("does not flag a public .torrent file (private=0)", () => {
    expect(isPrivateTorrentSource(writeTorrent(PUBLIC_TORRENT_EXPLICIT))).toBe(false);
  });

  it("never flags a magnet source (flag lives in metadata, not the magnet)", () => {
    expect(isPrivateTorrentSource("magnet:?xt=urn:btih:" + "a".repeat(40))).toBe(false);
  });

  it("treats an unreadable source (infoHash / missing file) as non-private", () => {
    expect(isPrivateTorrentSource("a".repeat(40))).toBe(false);
  });
});

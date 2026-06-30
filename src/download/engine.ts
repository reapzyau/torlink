import { readFileSync } from "node:fs";
import WebTorrent, { type Torrent } from "webtorrent";
import { getTrackers } from "../sources/magnet";

// A .torrent flagged private carries the bencoded token `7:privatei1e` (the key
// "private" with integer value 1) inside its info dict. Detecting it up front
// lets us keep a private torrent off public trackers — announcing it to
// opentrackr et al. would expose the swarm outside the private tracker's
// accounting, which is exactly the kind of leak that gets accounts banned.
const PRIVATE_FLAG = Buffer.from("7:privatei1e");

// Only a real .torrent file can be inspected before joining the swarm. A magnet
// can't be: its private flag lives in metadata fetched later (over the DHT),
// which is precisely why a private tracker's torrent must never be added by
// magnet. infoHash/magnet sources aren't files, so they read as non-private.
export function isPrivateTorrentSource(source: string): boolean {
  if (source.startsWith("magnet:")) return false;
  try {
    return readFileSync(source).includes(PRIVATE_FLAG);
  } catch {
    return false;
  }
}

export interface TorrentProgress {
  progress: number;
  downloaded: number;
  total: number;
  speed: number;
  uploadSpeed: number;
  uploaded: number;
  peers: number;
  timeRemaining: number;
  name: string;
}

export interface TorrentMeta {
  name: string;
  total: number;
  files: number;
  // The .torrent metadata (piece hashes), available once metadata arrives. We
  // persist it so a later re-seed can verify the on-disk file without having to
  // re-fetch metadata from the swarm (which a bare magnet would require).
  torrentFile?: Uint8Array;
}

export interface AddHandlers {
  onMetadata?: (meta: TorrentMeta) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class TorrentEngine {
  private client: WebTorrent | null = null;
  private torrents = new Map<string, Torrent>();

  private ensureClient(): WebTorrent {
    if (!this.client) {
      // lsd:false disables Local Service Discovery for every torrent. webtorrent
      // auto-disables DHT and PEX for private torrents but does NOT gate LSD on
      // the private flag, so a private torrent would still broadcast itself on
      // the local network — a leak private trackers ban for. LSD adds little for
      // a CLI fetcher, so turning it off wholesale is the safe, simple fix. DHT
      // stays on (public magnets need it; webtorrent disables it per private
      // torrent on its own).
      this.client = new WebTorrent({ lsd: false });
      this.client.on("error", () => {});
    }
    return this.client;
  }

  // `source` is a magnet URI, an infoHash, or a path to a .torrent file. Seeding
  // an existing file passes the stored .torrent path so webtorrent can verify it
  // locally instead of re-fetching metadata from the swarm.
  add(id: string, source: string, dir: string, handlers: AddHandlers): void {
    const client = this.ensureClient();
    const existing = this.torrents.get(id);
    if (existing) {
      this.torrents.delete(id);
      try {
        existing.destroy();
      } catch {}
    }

    let torrent: Torrent;
    try {
      // Merge the configured trackers into every PUBLIC torrent. webtorrent
      // unions these with any trackers already in the magnet/.torrent, so this
      // covers site-supplied magnets (e.g. eztv, subsplease) as well as the ones
      // we build ourselves. A private torrent is the exception: we withhold our
      // public trackers entirely so it announces only to its own (private)
      // tracker — pairing with webtorrent's per-torrent DHT/PEX shutoff to keep
      // the swarm fully inside the private tracker's accounting.
      const opts = isPrivateTorrentSource(source)
        ? { path: dir }
        : { path: dir, announce: getTrackers() };
      torrent = client.add(source, opts);
    } catch (e) {
      handlers.onError?.(message(e));
      return;
    }
    this.torrents.set(id, torrent);

    torrent.on("metadata", () => {
      handlers.onMetadata?.({
        name: torrent.name,
        total: torrent.length,
        files: torrent.files?.length ?? 0,
        torrentFile: torrent.torrentFile,
      });
    });
    torrent.on("done", () => {
      // A finished torrent is a complete, verified torrent: keep it alive so it
      // can seed. The queue owns its lifetime from here (remove/destroy).
      handlers.onDone?.();
    });
    torrent.on("error", (err: unknown) => {
      handlers.onError?.(message(err));
      this.torrents.delete(id);
      try {
        torrent.destroy();
      } catch {}
    });
  }

  // The TCP port the client accepts incoming peers on (diagnostics / tests).
  listenPort(): number | null {
    return this.client?.torrentPort ?? null;
  }

  stats(id: string): TorrentProgress | null {
    const t = this.torrents.get(id);
    if (!t) return null;
    return {
      progress: t.progress,
      downloaded: t.downloaded,
      total: t.length,
      speed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      uploaded: t.uploaded,
      peers: t.numPeers,
      timeRemaining: t.timeRemaining,
      name: t.name,
    };
  }

  remove(id: string): void {
    const t = this.torrents.get(id);
    this.torrents.delete(id);
    if (t) {
      try {
        t.destroy();
      } catch {}
    }
  }

  destroy(): void {
    this.torrents.clear();
    // Never block shutdown on webtorrent's async teardown: hand off the client
    // destroy to a later tick and let the OS reclaim sockets if we exit first.
    const client = this.client;
    this.client = null;
    if (client) {
      setImmediate(() => {
        try {
          client.destroy();
        } catch {}
      });
    }
  }
}

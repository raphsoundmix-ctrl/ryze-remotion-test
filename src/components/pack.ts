/** Pure read-only views over data/slot-assets.json for the page (counts, media list, asset bins). */
import type { Scene, SlotAssets } from "../contract";
import { slotIds } from "../lib/variants";

export type MediaKind = "video" | "audio" | "image";
export type ProvenanceEntry = SlotAssets["provenance"][string];

const KIND_BY_EXT: [MediaKind, RegExp][] = [
  ["video", /\.(mp4|webm|mov)$/i],
  ["audio", /\.(mp3|wav|m4a|aac|ogg)$/i],
  ["image", /\.(png|jpe?g|webp)$/i],
];

export const mediaKind = (p: string): MediaKind | null => KIND_BY_EXT.find(([, re]) => re.test(p))?.[0] ?? null;

const stem = (p: string) => p.replace(/\.[^./]+$/, "");
const fileName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const dirName = (p: string) => p.split("/").slice(-2, -1)[0] ?? "";

/** Every media file the template can reference: the set the Player must hold in memory to switch variants offline. */
export function packMediaPaths(a: SlotAssets): string[] {
  const set = new Set<string>();
  for (const s of Object.values(a.slots)) {
    for (const v of s.videoSrcs) set.add(v);
    set.add(s.audioSrc);
  }
  set.add(a.brand.packshotSrc);
  if (a.brand.logoSrc) set.add(a.brand.logoSrc);
  for (const m of Object.values(a.music)) set.add(m.src);
  for (const s of Object.values(a.sfx)) set.add(s.src);
  return [...set].sort();
}

export type PackStats = {
  files: number;
  clips: number;
  lines: number;
  words: number;
  timingSources: string[];
  hooks: number;
  bodies: number;
  ctas: number;
  variants: number;
};

export function packStats(a: SlotAssets): PackStats {
  const media = packMediaPaths(a);
  const ids = slotIds(a);
  const scenes = Object.values(a.slots);
  return {
    files: media.length,
    clips: media.filter((p) => mediaKind(p) === "video").length,
    lines: scenes.length,
    words: scenes.reduce((n, s) => n + s.words.length, 0),
    timingSources: [...new Set(scenes.flatMap((s) => (s.timingSource ? [s.timingSource] : [])))].sort(),
    hooks: ids.hooks.length,
    bodies: ids.bodies.length,
    ctas: ids.ctas.length,
    variants: ids.hooks.length * ids.bodies.length * ids.ctas.length,
  };
}

/** Pack-relative source key ("hooks/H1.mp4") -> the public/ path ingest produced for it (same file, or same stem and media kind). */
function resolvePublicPath(key: string, media: string[]): string | null {
  const exact = media.find((m) => m === key || m.endsWith(`/${key}`));
  if (exact) return exact;
  const kind = mediaKind(key);
  return media.find((m) => mediaKind(m) === kind && stem(m).endsWith(`/${stem(key)}`)) ?? null;
}

export const ASSET_BINS = ["hooks", "bodies", "ctas", "brand", "music", "sfx"] as const;
export type AssetBin = (typeof ASSET_BINS)[number] | "other";

export type AssetItem = {
  key: string;
  name: string;
  bin: AssetBin;
  src: string | null;
  kind: MediaKind | null;
  provenance: ProvenanceEntry | null;
  scene: Scene | null;
  /** Measured file length (music, sfx). Slot media show the slot duration from `scene` instead. */
  durationSec: number | null;
  label: string | null;
};

const binOf = (dir: string): AssetBin => ASSET_BINS.find((b) => b === dir) ?? "other";

function describe(a: SlotAssets, key: string, src: string | null, provenance: ProvenanceEntry | null): AssetItem {
  const name = fileName(key);
  const id = stem(name);
  const slotId = provenance?.slot ?? /^[HBC]\d+/.exec(id)?.[0];
  const scene = slotId ? a.slots[slotId] ?? null : null;
  const music = a.music[id];
  const sfx = a.sfx[id];
  return {
    key,
    name,
    bin: binOf(dirName(key)),
    src,
    kind: mediaKind(src ?? key),
    provenance,
    scene,
    durationSec: music?.durationSec ?? sfx?.durationSec ?? null,
    label: music?.label ?? null,
  };
}

/**
 * Asset bins for the AI-assets panel. Source of truth is the provenance record (one row per pack file);
 * a pack without provenance falls back to listing the media the template uses, marked as unrecorded.
 */
export function assetBins(a: SlotAssets): { bin: AssetBin; items: AssetItem[] }[] {
  const media = packMediaPaths(a);
  const keys = Object.keys(a.provenance);
  const items = keys.length
    ? keys.map((k) => describe(a, k, resolvePublicPath(k, media), a.provenance[k] ?? null))
    : media.map((p) => describe(a, p, p, null));
  const order: AssetBin[] = [...ASSET_BINS, "other"];
  return order
    .map((bin) => ({ bin, items: items.filter((i) => i.bin === bin).sort((x, y) => x.name.localeCompare(y.name)) }))
    .filter((g) => g.items.length > 0);
}

/**
 * The asset-pack tree of docs/ASSET_PACK.md §1 + the canonical texts of §3 (fallback when pack.csv lacks them).
 * Pure data, no node imports. The real pack must ingest with zero code changes, so everything
 * name/extension-related lives here.
 */

export type EntryKind = "csv" | "video" | "voice" | "image" | "music" | "sfx";

export type PackEntry = {
  /** canonical pack-relative path (forward slashes) */
  file: string;
  kind: EntryKind;
  required: boolean;
  /** slot id ("H1", "B1", "C2") or a group ("BRAND", "CTA", "MUSIC", "SFX") as in pack.csv */
  slot: string;
};

export const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".png", ".jpg", ".jpeg"];
export const IMAGE_CLIP_EXT = [".png", ".jpg", ".jpeg"];
export const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"];
export const SIDE_CAR_SUFFIXES = [".words.json", ".srt", ".truth.json"];

export const HOOK_IDS = ["H1", "H2", "H3"] as const;
export const BODY_IDS = ["B1", "B2"] as const;
export const CTA_IDS = ["C1", "C2"] as const;
export const BODY_CLIPS: Record<string, string[]> = { B1: ["B1a", "B1b"], B2: ["B2a", "B2b"] };

export const PACK_TREE: PackEntry[] = [
  { file: "pack.csv", kind: "csv", required: true, slot: "PACK" },
  { file: "brand/packshot.png", kind: "image", required: true, slot: "BRAND" },
  { file: "brand/logo.png", kind: "image", required: false, slot: "BRAND" },
  ...HOOK_IDS.flatMap((h) => [
    { file: `hooks/${h}.mp4`, kind: "video" as const, required: true, slot: h },
    { file: `hooks/${h}.mp3`, kind: "voice" as const, required: true, slot: h },
  ]),
  ...BODY_IDS.flatMap((b) => [
    ...BODY_CLIPS[b].map((c) => ({ file: `bodies/${c}.mp4`, kind: "video" as const, required: true, slot: b })),
    { file: `bodies/${b}.mp3`, kind: "voice" as const, required: true, slot: b },
  ]),
  ...CTA_IDS.map((c) => ({ file: `ctas/${c}.mp3`, kind: "voice" as const, required: true, slot: c })),
  { file: "ctas/C.mp4", kind: "video", required: false, slot: "CTA" },
  { file: "music/M1.mp3", kind: "music", required: true, slot: "MUSIC" },
  { file: "music/M2.mp3", kind: "music", required: true, slot: "MUSIC" },
  { file: "sfx/whoosh.wav", kind: "sfx", required: false, slot: "SFX" },
  { file: "sfx/pop.wav", kind: "sfx", required: false, slot: "SFX" },
];

/** Accepted extensions per canonical entry (a real pack may deliver WAV voices or MOV clips). */
export function acceptedExtensions(e: PackEntry): string[] {
  if (e.kind === "csv") return [".csv"];
  if (e.kind === "video") return VIDEO_EXT;
  if (e.kind === "voice" || e.kind === "music" || e.kind === "sfx") return AUDIO_EXT;
  return [".png"];
}

export type SlotText = { slot: "hook" | "body" | "cta"; role: string; text: string; onScreen?: string };

/** docs/ASSET_PACK.md §3 (verbatim). */
export const CANONICAL_TEXTS: Record<string, SlotText> = {
  H1: { slot: "hook", role: "Question hook", text: "Why is your water always warm by noon?", onScreen: "WARM WATER BY NOON?" },
  H2: { slot: "hook", role: "Demo hook", text: "Yesterday's ice. Still in here.", onScreen: "YESTERDAY'S ICE. STILL HERE." },
  H3: { slot: "hook", role: "UGC hook", text: "I stopped buying bottled water. Here's why.", onScreen: "I QUIT BOTTLED WATER" },
  B1: { slot: "body", role: "Proof", text: "Double steel walls keep drinks ice cold for twenty-four hours. Car, gym, beach. Still cold." },
  B2: { slot: "body", role: "Durability", text: "Leak-proof lid. Fits every cup holder. Survives the drops. Built for real days." },
  C1: { slot: "cta", role: "CTA", text: "Get yours. Link in bio." },
  C2: { slot: "cta", role: "CTA", text: "Thirty-day trial. Tap the link." },
};

export const BRAND_NAME = "NORDA";
export const PACK_CSV_COLUMNS = ["file", "slot", "kind", "tool", "model", "prompt", "text", "onScreen", "created", "provenance"] as const;

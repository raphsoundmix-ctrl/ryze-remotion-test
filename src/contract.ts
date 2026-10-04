import { z } from "zod";

import { SLOT_MAX_SEC, STYLES, TIMING_SOURCES } from "./constants";

export * from "./constants";

/* ─────────────────────────── Manifest v2 = Remotion inputProps ─────────────────────────── */
export const WordSchema = z.object({
  word: z.string().min(1),
  startMs: z.number().nonnegative(), // scene-local, lead included
  endMs: z.number().positive(),
});
export type Word = z.infer<typeof WordSchema>;

export const SceneSchema = z.object({
  id: z.string().regex(/^[HBC]\d+$/), // "H1" "B2" "C1"
  slot: z.enum(["hook", "body", "cta"]),
  text: z.string().min(1), // VO text, verbatim from pack.csv
  onScreen: z.string().optional(),
  videoSrcs: z.array(z.string().min(1)).min(1).max(3), // relative to public/, no leading slash
  audioSrc: z.string().min(1),
  words: z.array(WordSchema).min(1),
  durationSec: z.number().positive(), // probed: LEAD + VO + TAIL
  clipSec: z.number().positive().nullable().optional(), // shortest probed clip length (null = a still image is involved)
  clipSecs: z.array(z.number().positive().nullable()).optional(), // probed length per videoSrcs entry (null = still image)
  timingSource: z.enum(TIMING_SOURCES).optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ProvenanceSchema = z.enum(["synthetic", "pre-generated"]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ManifestSchema = z.object({
  schema: z.literal(2),
  variantId: z.string().regex(/^H\d+_B\d+_C\d+(_[a-z0-9]+)*$/),
  style: z.enum(STYLES),
  format: z.enum(["9x16", "1x1", "4x5"]),
  brand: z.object({ name: z.string().min(1), packshotSrc: z.string().min(1), logoSrc: z.string().optional() }),
  music: z.object({ id: z.string(), src: z.string().min(1), volume: z.number().min(0).max(1) }).nullable(),
  sfx: z.object({ transition: z.string().optional(), pop: z.string().optional() }).nullable().optional(),
  pack: z.object({ id: z.string(), provenance: ProvenanceSchema }),
  scenes: z.array(SceneSchema).length(3), // order hook, body, cta (validateManifest)
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** Rules zod cannot express as a plain object schema. Returns human-readable problems (empty = valid). */
export function validateManifest(m: Manifest): string[] {
  const problems: string[] = [];
  const order = ["hook", "body", "cta"] as const;
  m.scenes.forEach((s, i) => {
    if (s.slot !== order[i]) problems.push(`scene ${i} must be ${order[i]}, got ${s.slot}`);
    if (s.id[0] !== s.slot[0].toUpperCase()) problems.push(`scene ${s.id} id prefix does not match slot ${s.slot}`);
    if (s.durationSec > SLOT_MAX_SEC[s.slot] + 1e-6) problems.push(`scene ${s.id} ${s.durationSec}s > ${s.slot} max ${SLOT_MAX_SEC[s.slot]}s`);
    let prev = -1;
    for (const w of s.words) {
      if (w.endMs <= w.startMs) problems.push(`scene ${s.id} word "${w.word}" ends before it starts`);
      if (w.startMs < prev) problems.push(`scene ${s.id} words not sorted at "${w.word}"`);
      if (w.endMs > s.durationSec * 1000 + 1) problems.push(`scene ${s.id} word "${w.word}" ends after scene end`);
      prev = w.startMs;
    }
  });
  const expectedPrefix = `${m.scenes[0]?.id}_${m.scenes[1]?.id}_${m.scenes[2]?.id}`;
  if (!m.variantId.startsWith(expectedPrefix)) problems.push(`variantId ${m.variantId} does not start with ${expectedPrefix}`);
  return problems;
}

/* ─────────────────────────── data/slot-assets.json (written by ingest, read by the browser) ─────────────────────────── */
export const SlotAssetSchema = SceneSchema; // a slot is a scene before it is combined into a variant

export const ProvenanceEntrySchema = z.object({
  tool: z.string(),
  model: z.string(),
  prompt: z.string(),
  created: z.string(),
  text: z.string().optional(),
  kind: z.string().optional(),
  slot: z.string().optional(),
});

export const SlotAssetsSchema = z.object({
  pack: z.object({ id: z.string(), provenance: ProvenanceSchema, createdAt: z.string() }),
  brand: z.object({ name: z.string(), packshotSrc: z.string(), logoSrc: z.string().optional() }),
  slots: z.record(z.string(), SlotAssetSchema),
  music: z.record(z.string(), z.object({ src: z.string(), durationSec: z.number().positive(), label: z.string().optional() })),
  sfx: z.record(z.string(), z.object({ src: z.string(), durationSec: z.number().positive() })),
  provenance: z.record(z.string(), ProvenanceEntrySchema), // key: pack-relative source file, e.g. "hooks/H1.mp4"
});
export type SlotAssets = z.infer<typeof SlotAssetsSchema>;

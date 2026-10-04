import { z } from "zod";
import type { SlotAssets } from "../contract";

/**
 * Result of reading one build-time input. `missing` and `invalid` are rendered as explicit
 * states in the UI, never coerced into zeros or empty lists.
 */
export type Loaded<T> =
  | { kind: "ok"; data: T }
  | { kind: "missing"; path: string }
  | { kind: "invalid"; path: string; problem: string };

/** One row of public/metrics.json; scripts/render-mvp.ts writes every cell as a string (CSV parity). */
export const MetricsRowSchema = z.object({
  variant_id: z.string(),
  hook_id: z.string(),
  body_id: z.string(),
  cta_id: z.string(),
  style: z.string(),
  music_id: z.string(),
  format: z.string(),
  file: z.string(),
  duration_sec: z.string(),
  render_sec: z.string(),
  rss_mb: z.string(),
  status: z.enum(["ok", "skipped", "failed"]),
  reason: z.string(),
  spend: z.string(),
  ctr: z.string(),
  hook_rate_3s: z.string(),
  hold_rate: z.string(),
});
export type MetricsRow = z.infer<typeof MetricsRowSchema>;

export const MetricsSchema = z.object({
  generatedAt: z.string(),
  machine: z.object({ cpu: z.string(), cores: z.number(), ramGb: z.number(), os: z.string(), node: z.string() }),
  settings: z.object({ concurrency: z.number(), parallel: z.number(), codec: z.string().optional(), crf: z.number().optional() }),
  bundleSec: z.number(),
  wallSec: z.number(),
  rendered: z.number(),
  skipped: z.number(),
  failed: z.number(),
  avgRenderSec: z.number().nullable(),
  minRenderSec: z.number().nullable(),
  maxRenderSec: z.number().nullable(),
  videosPerHour: z.number().nullable(),
  peakRssMb: z.number(),
  rows: z.array(MetricsRowSchema),
});
export type Metrics = z.infer<typeof MetricsSchema>;

/** A rendered preview in public/previews (540x960 mp4 + optional jpg poster). */
export type Preview = { variantId: string; video: string; poster: string | null };

export type PageData = {
  assets: Loaded<SlotAssets>;
  metrics: Loaded<Metrics>;
  previews: Preview[];
};

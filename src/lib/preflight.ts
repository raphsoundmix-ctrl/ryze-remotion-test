/**
 * Media preflight (node-only): zod alone cannot tell that a file exists or that a voice line fits its slot.
 * Never throws: every problem becomes a reason string, so one bad variant is skipped, not the batch.
 */
import fs from "node:fs";
import path from "node:path";
import { ManifestSchema, SLOT_MAX_SEC, validateManifest, type Manifest } from "../contract";

export type Probe = (file: string) => Promise<{ durationSec: number; width?: number; height?: number }>;
export type PreflightResult = { ok: true; manifest: Manifest; problems: [] } | { ok: false; manifest?: Manifest; problems: string[] };

const AUDIO_TOLERANCE_SEC = 0.05;

export async function preflight(raw: unknown, opts: { publicDir: string; probe?: Probe }): Promise<PreflightResult> {
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.slice(0, 5).map((i) => `schema: ${i.path.join(".")} ${i.message}`) };
  }
  const m = parsed.data;
  const problems = validateManifest(m);
  const files = new Set<string>([m.brand.packshotSrc]);
  if (m.music) files.add(m.music.src);
  for (const s of m.scenes) {
    s.videoSrcs.forEach((v) => files.add(v));
    files.add(s.audioSrc);
  }
  for (const rel of files) {
    if (!fs.existsSync(path.join(opts.publicDir, rel))) problems.push(`missing file: public/${rel}`);
  }
  if (opts.probe && problems.length === 0) {
    for (const s of m.scenes) {
      try {
        const { durationSec } = await opts.probe(path.join(opts.publicDir, s.audioSrc));
        if (durationSec > SLOT_MAX_SEC[s.slot] + AUDIO_TOLERANCE_SEC) {
          problems.push(`${s.id} audio ${durationSec.toFixed(2)}s exceeds ${s.slot} max ${SLOT_MAX_SEC[s.slot]}s`);
        }
        if (Math.abs(durationSec - s.durationSec) > 0.25) {
          problems.push(`${s.id} audio ${durationSec.toFixed(2)}s != manifest durationSec ${s.durationSec}s (re-run ingest)`);
        }
      } catch (e) {
        problems.push(`${s.id} unreadable audio: ${(e as Error).message.slice(0, 120)}`);
      }
    }
  }
  return problems.length ? { ok: false, manifest: m, problems } : { ok: true, manifest: m, problems: [] };
}

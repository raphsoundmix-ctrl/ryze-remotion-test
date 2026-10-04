/**
 * Ingest of visual assets (RUNBOOK P2 steps 2-3): 9:16 clips → 720×1280 H.264, image clips, packshot/logo with alpha.
 * Node-only.
 */
import fs from "node:fs";
import path from "node:path";
import { decodePng } from "./png";
import { displaySize, ffmpeg, probe, probeDuration, videoStream } from "./ffmpeg";
import { IngestError } from "./ingest-audio";

const TARGET_W = 720;
const TARGET_H = 1280;
const ASPECT_TOLERANCE = 0.02;
const MAX_CLIP_BYTES = 3 * 1024 * 1024;
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;
const COVER = `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,crop=${TARGET_W}:${TARGET_H}`;
const MEZZ_W = 1080;
const MEZZ_H = 1920;
const MEZZ_COVER = `scale=${MEZZ_W}:${MEZZ_H}:force_original_aspect_ratio=increase,crop=${MEZZ_W}:${MEZZ_H}`;

function checkAspect(w: number, h: number): void {
  if (!w || !h) throw new IngestError("no video dimensions");
  const ratio = w / h / (9 / 16);
  if (Math.abs(ratio - 1) > ASPECT_TOLERANCE) throw new IngestError(`not 9:16 (${w}x${h}, ${(w / h).toFixed(3)} vs 0.5625 ±2 %)`);
}

/** Video clip → 720×1280 libx264 crf 24 (retry crf 28 above 3 MB), yuv420p, 30 fps, no audio, ≤ 5.5 s, faststart. */
export async function processVideo(input: string, output: string, mezzOutput?: string): Promise<{ clipSec: number; detail: string }> {
  const p = await probe(input);
  const v = videoStream(p);
  if (!v) throw new IngestError("no video stream");
  const { width, height } = displaySize(v);
  checkAspect(width, height);
  const notes: string[] = [];
  if (width < TARGET_W || height < TARGET_H) notes.push(`upscaled from below ${TARGET_W}x${TARGET_H}`);
  let crf = 24;
  for (;;) {
    await ffmpeg([
      "-v", "error", "-i", input, "-an", "-sn", "-dn", "-vf", COVER, "-r", "30",
      "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-aspect", "9:16",
      "-t", "5.5", "-movflags", "+faststart", output,
    ]);
    if (fs.statSync(output).size <= MAX_CLIP_BYTES || crf >= 28) break;
    crf = 28;
  }
  const out = await probe(output);
  const ov = videoStream(out);
  const clipSec = Math.round(probeDuration(out) * 1000) / 1000;
  if (!ov || ov.width !== TARGET_W || ov.height !== TARGET_H || !(clipSec > 0)) throw new IngestError("transcode produced an invalid clip");
  if (fs.statSync(output).size > MAX_CLIP_BYTES) notes.push(`above 3 MB even at crf 28`);
  if (mezzOutput && width >= MEZZ_W && height >= MEZZ_H) {
    // Render-quality copy (outside public/): the final 1080x1920 ad is not upscaled from the 720p proxy.
    fs.mkdirSync(path.dirname(mezzOutput), { recursive: true });
    await ffmpeg([
      "-v", "error", "-i", input, "-an", "-sn", "-dn", "-vf", MEZZ_COVER, "-r", "30",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-aspect", "9:16", "-t", "5.5", mezzOutput,
    ]);
    notes.push(`1080p mezzanine ${mb(fs.statSync(mezzOutput).size)} for render`);
  }
  return {
    clipSec,
    detail: [`${width}x${height} ${probeDuration(p).toFixed(2)} s ${mb(fs.statSync(input).size)} → ${TARGET_W}x${TARGET_H} ${clipSec.toFixed(2)} s ${mb(fs.statSync(output).size)} crf ${crf}`, ...notes].join("; "),
  };
}

/** Still image used as a clip (Ken Burns in the template): cover-cropped to 720×1280, same format family. */
export async function processImageClip(input: string, output: string): Promise<{ clipSec: null; detail: string }> {
  const p = await probe(input);
  const v = videoStream(p);
  if (!v) throw new IngestError("unreadable image");
  const { width, height } = displaySize(v);
  checkAspect(width, height);
  const jpg = /\.jpe?g$/i.test(output);
  await ffmpeg(["-v", "error", "-i", input, "-vf", COVER, "-frames:v", "1", ...(jpg ? ["-q:v", "3"] : ["-pix_fmt", "rgb24"]), output]);
  return { clipSec: null, detail: `image ${width}x${height} → ${TARGET_W}x${TARGET_H} ${mb(fs.statSync(output).size)}` };
}

const ALPHA_FORMATS = /^(rgba|bgra|argb|abgr|ya8|ya16|rgba64|bgra64|yuva|gbrap|pal8)/;

/** PNG with alpha → RGBA PNG, longest side ≤ maxSide. FAIL without an alpha channel; warns when fully opaque. */
export async function processAlphaImage(
  input: string,
  output: string,
  maxSide: number,
  requireAlpha: boolean,
): Promise<{ width: number; height: number; detail: string }> {
  const p = await probe(input);
  const v = videoStream(p);
  if (!v) throw new IngestError("unreadable image");
  const pix = v.pix_fmt ?? "?";
  if (requireAlpha && !ALPHA_FORMATS.test(pix)) throw new IngestError(`no alpha channel (pix_fmt ${pix}); background must be removed`);
  const w0 = v.width ?? 0;
  const h0 = v.height ?? 0;
  await ffmpeg([
    "-v", "error", "-i", input,
    "-vf", `scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease`,
    "-pix_fmt", "rgba", "-frames:v", "1", output,
  ]);
  const img = decodePng(fs.readFileSync(output));
  let transparent = 0;
  for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i] < 250) transparent++;
  const share = transparent / (img.width * img.height);
  if (requireAlpha && share === 0) throw new IngestError(`alpha channel is fully opaque (${pix}); background was not removed`);
  const notes: string[] = [];
  if (requireAlpha && Math.max(w0, h0) < 1500) notes.push("source below 1500 px");
  return {
    width: img.width,
    height: img.height,
    detail: [`${w0}x${h0} ${pix} → ${img.width}x${img.height} rgba, ${(share * 100).toFixed(0)} % transparent, ${mb(fs.statSync(output).size)}`, ...notes].join("; "),
  };
}

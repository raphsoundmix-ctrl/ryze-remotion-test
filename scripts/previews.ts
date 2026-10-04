/**
 * Web previews + proof images from the rendered MP4s (bundled ffmpeg only):
 *   public/previews/<id>.mp4   540 px wide, H.264 crf 28 (~1 MB) for the gallery
 *   public/previews/<id>.jpg   poster at 1.0 s
 *   docs/img/contact-sheet.png one frame of every variant (hook moment), tiled
 *   docs/img/filmstrip.png     6 moments of H1_B1_C1 from the real MP4
 *   npm run previews
 */
import fs from "node:fs";
import path from "node:path";
import { ffmpeg } from "../src/lib/media/ffmpeg";
import { decodePng, encodePng } from "../src/lib/media/png";
import { textMask } from "../src/lib/media/font";
import { FPS, ManifestSchema } from "../src/contract";
import { sceneStarts, sequenceFrames } from "../src/lib/timing";

type Row = { variant_id: string; file: string; status: string; duration_sec: string };

/** One frame as packed RGB (the bundled ffmpeg has no rawvideo muxer, so go through a PNG pipe). */
async function frameRgb(file: string, atSec: number, w: number, h: number): Promise<Buffer> {
  const png = await ffmpeg(["-v", "error", "-ss", atSec.toFixed(2), "-i", file, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-c:v", "png", "-f", "image2pipe", "-"]);
  const { rgba } = decodePng(png);
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  return rgb;
}

function tile(frames: Buffer[], cols: number, w: number, h: number, gap: number, bg = [14, 14, 16]) {
  const rows = Math.ceil(frames.length / cols);
  const W = cols * w + (cols + 1) * gap, H = rows * h + (rows + 1) * gap;
  const px = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) px.set(bg, i * 3);
  frames.forEach((f, k) => {
    const x0 = gap + (k % cols) * (w + gap), y0 = gap + Math.floor(k / cols) * (h + gap);
    for (let y = 0; y < h; y++) px.set(f.subarray(y * w * 3, (y + 1) * w * 3), ((y0 + y) * W + x0) * 3);
  });
  return encodePng(px, W, H, 3, 6);
}

/** Every variant as a labelled hook | body | CTA triptych, so the recombination is visible at a glance. */
async function contactSheet(rows: Row[]) {
  const fw = 120, fh = 213, inner = 4, gap = 22, cols = 4, labelH = 26, cell = 2;
  const bw = fw * 3 + inner * 2, bh = labelH + fh;
  const W = cols * bw + (cols + 1) * gap, H = Math.ceil(rows.length / cols) * bh + (Math.ceil(rows.length / cols) + 1) * gap;
  const px = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) px.set([14, 14, 16], i * 3);
  for (const [k, r] of rows.entries()) {
    const m = ManifestSchema.parse(JSON.parse(fs.readFileSync(path.join("data/variants", `${r.variant_id}.json`), "utf8")));
    const st = sceneStarts(m), len = sequenceFrames(m);
    const times = [1.0, (st[1] + len[1] * 0.45) / FPS, (st[2] + len[2] * 0.7) / FPS];
    const frames = await Promise.all(times.map((t) => frameRgb(r.file, t, fw, fh)));
    const x0 = gap + (k % cols) * (bw + gap), y0 = gap + Math.floor(k / cols) * (bh + gap);
    const label = textMask(r.variant_id.replace(/_/g, " "), cell);
    for (let y = 0; y < label.height; y++) for (let x = 0; x < label.width; x++) {
      if (label.mask[y * label.width + x]) px.set([237, 237, 239], ((y0 + 4 + y) * W + x0 + x) * 3);
    }
    frames.forEach((f, j) => {
      const fx = x0 + j * (fw + inner);
      for (let y = 0; y < fh; y++) px.set(f.subarray(y * fw * 3, (y + 1) * fw * 3), ((y0 + labelH + y) * W + fx) * 3);
    });
  }
  return encodePng(px, W, H, 3, 6);
}

async function main() {
  const metrics = JSON.parse(fs.readFileSync("out/metrics.json", "utf8")) as { rows: Row[] };
  const ok = metrics.rows.filter((r) => r.status === "ok" && fs.existsSync(r.file));
  if (!ok.length) throw new Error("no rendered videos in out/metrics.json (run npm run render)");
  const outDir = path.resolve("public/previews");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  let bytes = 0;
  await Promise.all(ok.map(async (r) => {
    const mp4 = path.join(outDir, `${r.variant_id}.mp4`);
    await ffmpeg(["-v", "error", "-y", "-i", r.file, "-vf", "scale=540:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", mp4]);
    await ffmpeg(["-v", "error", "-y", "-ss", "1.0", "-i", r.file, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", path.join(outDir, `${r.variant_id}.jpg`)]);
    bytes += fs.statSync(mp4).size;
  }));
  console.log(`${ok.length} previews -> public/previews (${(bytes / 2 ** 20).toFixed(1)} MB video)`);

  fs.mkdirSync("docs/img", { recursive: true });
  fs.writeFileSync("docs/img/contact-sheet.png", await contactSheet(ok.slice(0, 12)));
  const w = 216, h = 384;
  const hero = ok.find((r) => r.variant_id === "H1_B1_C1") ?? ok[0];
  const dur = Number(hero.duration_sec);
  const moments = [0.6, 1.8, dur * 0.38, dur * 0.55, dur * 0.72, dur - 0.4];
  const strip = await Promise.all(moments.map((t) => frameRgb(hero.file, t, w, h)));
  fs.writeFileSync("docs/img/filmstrip.png", tile(strip, 6, w, h, 12));
  console.log(`docs/img/contact-sheet.png (${Math.min(12, ok.length)} variants), docs/img/filmstrip.png (${hero.variant_id})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

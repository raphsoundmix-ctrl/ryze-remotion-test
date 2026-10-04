/**
 * Batch renderer: data/variants/*.json -> out/<variantId>.mp4 + out/manifest.csv + public/metrics.json
 * Bundles ONCE, then per variant: parse + preflight -> render (try/catch). A bad variant is skipped with a reason.
 *   npm run render                                  # all variants
 *   npm run render -- --only H2 --limit 4           # filter by id substring, cap count
 *   npm run render -- --concurrency 8 --parallel 2  # frames per video / videos at once
 *   npm run render -- --browser "C:/.../chrome.exe" # or env REMOTION_BROWSER_EXECUTABLE (our variable)
 *   npm run render -- --dir <variantsDir> --out <outDir>   # used by the failure-isolation demo
 * Exit code is non-zero only if nothing rendered.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { FPS } from "../src/contract";
import { totalFrames } from "../src/lib/timing";
import { preflight } from "../src/lib/preflight";
import { probe, probeDuration } from "../src/lib/media/ffmpeg";

const probeMedia = async (file: string) => ({ durationSec: probeDuration(await probe(file)) });

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const HEADER = [
  "variant_id", "hook_id", "body_id", "cta_id", "style", "music_id", "format", "file", "duration_sec", "render_sec", "rss_mb",
  "status", "reason", "spend", "ctr", "hook_rate_3s", "hold_rate",
] as const;
type Row = Record<(typeof HEADER)[number], string>;
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Tiny concurrency limiter (p-limit is ESM-only under tsx/CJS). */
async function runLimited<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const variantsDir = path.resolve(arg("--dir") ?? "data/variants");
  const outDir = path.resolve(arg("--out") ?? "out");
  const publicDir = path.resolve("public");
  const only = arg("--only");
  const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
  const cores = os.cpus().length;
  const concurrency = Math.min(cores, Number(arg("--concurrency") ?? Math.max(1, Math.floor(cores / 2))));
  const parallel = Math.max(1, Number(arg("--parallel") ?? 1));
  const browserExecutable = arg("--browser") ?? process.env.REMOTION_BROWSER_EXECUTABLE ?? null;
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(variantsDir).filter((f) => f.endsWith(".json")).sort()
    .filter((f) => !only || f.includes(only)).slice(0, limit);
  if (files.length === 0) {
    console.error(`No variants in ${variantsDir} (run npm run build:variants).`);
    process.exit(1);
  }

  console.log(`Bundling once… (${files.length} variants, concurrency ${concurrency}/video, parallel ${parallel}, ${cores} cores)`);
  const tBundle = Date.now();
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts"), publicDir });
  const bundleSec = (Date.now() - tBundle) / 1000;

  const rows: Row[] = [];
  let peakRss = 0;
  const rssTimer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 250);
  const writeOut = () => {
    const sorted = [...rows].sort((a, b) => a.variant_id.localeCompare(b.variant_id));
    fs.writeFileSync(path.join(outDir, "manifest.csv"), [HEADER.join(","), ...sorted.map((r) => HEADER.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n");
  };

  const tAll = Date.now();
  await runLimited(files, parallel, async (f, i) => {
    const id = f.replace(/\.json$/, "");
    const base: Row = { variant_id: id, hook_id: "", body_id: "", cta_id: "", style: "", music_id: "", format: "", file: "", duration_sec: "", render_sec: "", rss_mb: "", status: "skipped", reason: "", spend: "", ctr: "", hook_rate_3s: "", hold_rate: "" };
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(variantsDir, f), "utf8"));
    } catch (e) {
      rows.push({ ...base, reason: `invalid JSON: ${(e as Error).message.slice(0, 80)}` });
      console.log(`[${i + 1}/${files.length}] SKIP ${id}: invalid JSON`);
      return writeOut();
    }
    const pf = await preflight(raw, { publicDir, probe: probeMedia });
    if (!pf.ok) {
      rows.push({ ...base, reason: pf.problems.join(" | ") });
      console.log(`[${i + 1}/${files.length}] SKIP ${id}: ${pf.problems[0]}`);
      return writeOut();
    }
    const m = pf.manifest;
    const meta = { ...base, variant_id: m.variantId, hook_id: m.scenes[0].id, body_id: m.scenes[1].id, cta_id: m.scenes[2].id, style: m.style, music_id: m.music?.id ?? "", format: m.format, duration_sec: (totalFrames(m) / FPS).toFixed(2) };
    const file = path.join(outDir, `${m.variantId}.mp4`);
    const t0 = Date.now();
    try {
      const composition = await selectComposition({ serveUrl, id: "AdVariant", inputProps: m, browserExecutable });
      await renderMedia({
        composition, serveUrl, codec: "h264", outputLocation: file, inputProps: m, concurrency, browserExecutable,
        crf: 20, audioBitrate: "192k",
      });
      const sec = (Date.now() - t0) / 1000;
      rows.push({ ...meta, file: path.relative(process.cwd(), file).replace(/\\/g, "/"), render_sec: sec.toFixed(2), rss_mb: (peakRss / 1048576).toFixed(0), status: "ok" });
      console.log(`[${i + 1}/${files.length}] OK   ${m.variantId}  ${sec.toFixed(1)}s  (${meta.duration_sec}s video)`);
    } catch (e) {
      rows.push({ ...meta, status: "failed", reason: (e as Error).message.split("\n")[0].slice(0, 200) });
      console.log(`[${i + 1}/${files.length}] FAIL ${m.variantId}: ${(e as Error).message.split("\n")[0]}`);
    }
    writeOut();
  });
  clearInterval(rssTimer);
  const wallSec = (Date.now() - tAll) / 1000;

  const ok = rows.filter((r) => r.status === "ok");
  const times = ok.map((r) => Number(r.render_sec));
  const summary = {
    generatedAt: new Date().toISOString(),
    machine: { cpu: os.cpus()[0]?.model.trim() ?? "unknown", cores, ramGb: Math.round(os.totalmem() / 2 ** 30), os: `${os.type()} ${os.release()}`, node: process.version },
    settings: { concurrency, parallel, codec: "h264", crf: 20, browser: browserExecutable ? "external" : "remotion-headless-shell" },
    bundleSec: Number(bundleSec.toFixed(2)),
    wallSec: Number(wallSec.toFixed(2)),
    rendered: ok.length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    failed: rows.filter((r) => r.status === "failed").length,
    avgRenderSec: times.length ? Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)) : null,
    minRenderSec: times.length ? Math.min(...times) : null,
    maxRenderSec: times.length ? Math.max(...times) : null,
    videosPerHour: ok.length ? Math.floor((3600 * ok.length) / wallSec) : null,
    peakRssMb: Math.round(peakRss / 1048576),
    rows: [...rows].sort((a, b) => a.variant_id.localeCompare(b.variant_id)),
  };
  fs.writeFileSync(path.join(outDir, "metrics.json"), JSON.stringify(summary, null, 2) + "\n");
  if (!arg("--out")) {
    fs.writeFileSync(path.join(publicDir, "metrics.json"), JSON.stringify(summary, null, 2) + "\n");
    fs.copyFileSync(path.join(outDir, "manifest.csv"), path.join(publicDir, "manifest.csv")); // downloadable from the Playground
  }

  console.log(`\n${ok.length} rendered, ${summary.skipped} skipped, ${summary.failed} failed in ${wallSec.toFixed(1)}s wall (+${bundleSec.toFixed(1)}s bundle).`);
  if (times.length) console.log(`avg ${summary.avgRenderSec}s/video, ~${summary.videosPerHour} videos/hour on this machine (${cores} cores, concurrency ${concurrency}, parallel ${parallel}). See ${path.relative(process.cwd(), outDir)}/manifest.csv`);
  process.exit(ok.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

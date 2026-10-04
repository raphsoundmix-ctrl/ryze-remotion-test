/**
 * npm run ingest -- <dir|zip> [--id <packId>] [--keep-others] [--dry-run] [--report <file.md>]
 *
 * Normalises any asset pack (synthetic now, the real AI-generated pack later; tree of docs/ASSET_PACK.md §1)
 * into public/packs/<packId>/**, data/slot-assets.json (validated with SlotAssetsSchema) and docs/INGEST_REPORT.md.
 * Work happens in public/packs/.staging-<id>; the live pack and slot-assets.json are only replaced when the
 * result is viable (packshot + ≥1 hook, body and CTA slot, size budget). Exit 1 = nothing replaced.
 */
import fs from "node:fs";
import path from "node:path";
import { SLOT_MAX_SEC, SlotAssetsSchema, type Scene, type SlotAssets } from "../src/contract";
import { resolveBinary, run } from "../src/lib/media/ffmpeg";
import { IngestError, processMusic, processSfx, processVoice, type VoiceResult } from "../src/lib/media/ingest-audio";
import { processAlphaImage, processImageClip, processVideo } from "../src/lib/media/ingest-visual";
import { renderReport, type FileRow, type SlotRow } from "../src/lib/media/ingest-report";
import { openPack, readPackCsv, rowFor, scanTree, type CsvRow, type TreeScan } from "../src/lib/media/pack-tree";
import { BODY_CLIPS, BODY_IDS, BRAND_NAME, CANONICAL_TEXTS, CTA_IDS, HOOK_IDS, IMAGE_CLIP_EXT, PACK_TREE } from "../src/lib/media/pack-spec";

const BUDGET = { perFileMb: 8, packMb: 25 };
const CONCURRENCY = 3;

type Opts = { input: string; id?: string; keepOthers: boolean; dryRun: boolean; report?: string };
type Done = { status: "OK" | "FAIL"; detail: string; outRel?: string; clipSec?: number | null; voice?: VoiceResult; durationSec?: number };

const log = (msg: string) => process.stdout.write(`[ingest] ${msg}\n`);
const posix = (p: string) => p.split(path.sep).join("/");

function parseArgs(argv: string[]): Opts {
  const o: Opts = { input: "", keepOthers: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") o.id = argv[++i];
    else if (a.startsWith("--id=")) o.id = a.slice(5);
    else if (a === "--keep-others") o.keepOthers = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--report") o.report = argv[++i];
    else if (a.startsWith("--report=")) o.report = a.slice(9);
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else if (!o.input) o.input = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!o.input) throw new Error("usage: npm run ingest -- <dir|zip> [--id <packId>] [--keep-others] [--dry-run] [--report <file>]");
  if (o.id !== undefined && !/^[a-z0-9][a-z0-9_-]{0,40}$/.test(o.id)) throw new Error(`--id must match [a-z0-9][a-z0-9_-]*, got "${o.id}"`);
  return o;
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** Output path (pack-relative) for a canonical entry, given the delivered source extension. */
function outRelFor(canonical: string, sourceRel: string): string {
  const stem = canonical.replace(/\.[^./]+$/, "");
  const ext = path.extname(sourceRel).toLowerCase();
  if (canonical.startsWith("sfx/")) return `${stem}.wav`;
  if (canonical.startsWith("brand/")) return `${stem}.png`;
  if (/\.(mp3)$/.test(canonical)) return `${stem}.mp3`;
  if (IMAGE_CLIP_EXT.includes(ext)) return `${stem}${ext === ".jpeg" ? ".jpg" : ext}`;
  return `${stem}.mp4`;
}

function slotText(byStem: Map<string, CsvRow>, slot: string, voiceFile: string): { text: string; onScreen?: string; note?: string } {
  const row = rowFor(byStem, voiceFile);
  const canon = CANONICAL_TEXTS[slot];
  const text = row?.text?.trim() || canon.text;
  // Canonical on-screen text only when the VO text is canonical too, so the overlay never contradicts the voice.
  const onScreen = row?.onScreen?.trim() || (canon.slot === "hook" && !row?.text?.trim() ? canon.onScreen : undefined);
  return { text, onScreen: onScreen || undefined, note: row?.text?.trim() ? undefined : "text from ASSET_PACK §3 (pack.csv has none)" };
}

function musicLabel(row: CsvRow | undefined, id: string): string {
  const parts = (row?.prompt ?? "").split(",").map((s) => s.trim()).filter((s) => s && !/^(instrumental|no vocals|\d+\s*seconds?)$/i.test(s) && !/^\(optional\)/i.test(s));
  return parts.slice(0, 2).join(" · ") || id;
}

function dirSizes(dir: string, base = dir): { file: string; bytes: number }[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? dirSizes(abs, base) : [{ file: posix(path.relative(base, abs)), bytes: fs.statSync(abs).size }];
  });
}

function renameWithRetry(from: string, to: string): void {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (i >= 4) {
        fs.cpSync(from, to, { recursive: true });
        fs.rmSync(from, { recursive: true, force: true });
        return;
      }
      const until = Date.now() + 200 * (i + 1);
      while (Date.now() < until) {
        // brief busy-wait: Windows can hold a transient lock (indexer/AV) on fresh files
      }
      if (!(e instanceof Error)) throw e;
    }
  }
}

async function processAll(root: string, scan: TreeScan, byStem: Map<string, CsvRow>, staging: string, mezzStaging: string): Promise<Map<string, Done>> {
  const done = new Map<string, Done>();
  const tasks = PACK_TREE.filter((e) => e.kind !== "csv" && scan.found.has(e.file));
  await pool(tasks, CONCURRENCY, async (e) => {
    const srcRel = scan.found.get(e.file) as string;
    const input = path.join(root, srcRel);
    const outRel = outRelFor(e.file, srcRel);
    const output = path.join(staging, outRel);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    try {
      if (e.kind === "video") {
        const isImage = IMAGE_CLIP_EXT.includes(path.extname(srcRel).toLowerCase());
        const r = isImage ? await processImageClip(input, output) : await processVideo(input, output, path.join(mezzStaging, outRel));
        done.set(e.file, { status: "OK", detail: r.detail, outRel, clipSec: r.clipSec });
      } else if (e.kind === "voice") {
        const slot = e.slot;
        const t = slotText(byStem, slot, e.file);
        const sc = scan.sidecars.get(e.file) ?? {};
        const abs = (f?: string) => (f ? path.join(root, f) : undefined);
        const voice = await processVoice({
          input, output, slotKind: CANONICAL_TEXTS[slot].slot, text: t.text,
          sidecars: { wordsJson: abs(sc.wordsJson), srt: abs(sc.srt), truth: abs(sc.truth) },
        });
        done.set(e.file, { status: "OK", detail: [voice.detail, t.note].filter(Boolean).join("; "), outRel, voice });
      } else if (e.kind === "music") {
        const r = await processMusic(input, output);
        done.set(e.file, { status: "OK", detail: r.detail, outRel, durationSec: r.durationSec });
      } else if (e.kind === "sfx") {
        const r = await processSfx(input, output);
        done.set(e.file, { status: "OK", detail: r.detail, outRel, durationSec: r.durationSec });
      } else if (e.kind === "image") {
        const isPackshot = e.file === "brand/packshot.png";
        const r = await processAlphaImage(input, output, isPackshot ? 1500 : 800, isPackshot);
        done.set(e.file, { status: "OK", detail: r.detail, outRel });
      }
    } catch (err) {
      fs.rmSync(output, { force: true });
      const msg = err instanceof IngestError ? err.message : `error: ${(err as Error).message}`;
      done.set(e.file, { status: "FAIL", detail: msg });
    }
    log(`${srcRel}: ${done.get(e.file)?.status}`);
  });
  return done;
}

type Built = { slots: Record<string, Scene>; rows: SlotRow[] };

function buildSlots(done: Map<string, Done>, byStem: Map<string, CsvRow>, src: (rel: string) => string): Built {
  const slots: Record<string, Scene> = {};
  const rows: SlotRow[] = [];
  const ok = (f: string) => (done.get(f)?.status === "OK" ? done.get(f) : undefined);
  const groups: { id: string; voice: string; visuals: string[] }[] = [
    ...HOOK_IDS.map((h) => ({ id: h, voice: `hooks/${h}.mp3`, visuals: [`hooks/${h}.mp4`] })),
    ...BODY_IDS.map((b) => ({ id: b, voice: `bodies/${b}.mp3`, visuals: BODY_CLIPS[b].map((c) => `bodies/${c}.mp4`) })),
    ...CTA_IDS.map((c) => ({ id: c, voice: `ctas/${c}.mp3`, visuals: ok("ctas/C.mp4") ? ["ctas/C.mp4"] : ["brand/packshot.png"] })),
  ];
  for (const g of groups) {
    const kind = CANONICAL_TEXTS[g.id].slot;
    const v = ok(g.voice);
    const vis = g.visuals.map((f) => ok(f)).filter((d): d is Done => !!d);
    const row: SlotRow = { id: g.id, status: "FAIL", durationSec: v?.voice?.durationSec ?? null, limitSec: SLOT_MAX_SEC[kind], timingSource: v?.voice?.timingSource ?? "", words: v?.voice?.words.length ?? 0, truthMaxErrMs: v?.voice?.truthMaxErrMs ?? null, reason: "" };
    rows.push(row);
    if (!v?.voice || !v.outRel) {
      row.reason = `voice ${g.voice}: ${done.get(g.voice)?.detail ?? "missing"}`;
      continue;
    }
    if (vis.length === 0) {
      row.reason = `no usable visual (${g.visuals.join(", ")})`;
      continue;
    }
    const t = slotText(byStem, g.id, g.voice);
    const clipSecs = vis.map((d) => d.clipSec ?? null);
    const scene: Scene = {
      id: g.id, slot: kind, text: t.text, ...(t.onScreen && kind === "hook" ? { onScreen: t.onScreen } : {}),
      videoSrcs: vis.map((d) => src(d.outRel as string)), audioSrc: src(v.outRel), words: v.voice.words,
      durationSec: v.voice.durationSec,
      clipSec: clipSecs.every((c): c is number => typeof c === "number") ? Math.min(...clipSecs) : null,
      clipSecs,
      timingSource: v.voice.timingSource,
    };
    const problems: string[] = [];
    let prev = -1;
    for (const w of scene.words) {
      if (w.endMs <= w.startMs || w.startMs < prev || w.endMs > scene.durationSec * 1000 + 1) problems.push(w.word);
      prev = w.startMs;
    }
    if (problems.length) {
      row.reason = `invalid word timings at ${problems.join(", ")}`;
      continue;
    }
    if (vis.length < g.visuals.length) row.reason = `using ${vis.length}/${g.visuals.length} clips`;
    row.status = "OK";
    slots[g.id] = scene;
  }
  return { slots, rows };
}

async function ffmpegVersion(): Promise<string> {
  const bin = resolveBinary("ffmpeg");
  const r = await run(bin, ["-version"]);
  const v = r.stdout.toString().split(/\r?\n/)[0]?.match(/ffmpeg version (\S+)/)?.[1] ?? "?";
  return `ffmpeg ${v} (${bin.includes("@remotion") ? "Remotion bundled" : "PATH"}), own energy VAD (src/lib/media/vad.ts)`;
}

function fileRows(scan: TreeScan, done: Map<string, Done>, csvCount: number, provenance: string): FileRow[] {
  return PACK_TREE.map((e): FileRow => {
    const rel = scan.found.get(e.file);
    if (!rel) return { file: e.file, status: e.required ? "MISSING" : "SKIP", detail: e.required ? "required file not found" : "optional, not provided" };
    if (e.kind === "csv") return { file: rel, status: "OK", detail: `${csvCount} rows, provenance ${provenance}` };
    const d = done.get(e.file);
    return { file: rel, status: d?.status ?? "FAIL", detail: d?.detail ?? "not processed" };
  });
}

type Ctx = { root: string; scan: TreeScan; csvRows: CsvRow[]; byStem: Map<string, CsvRow>; packId: string; provenance: "synthetic" | "pre-generated" };

function assembleAssets(ctx: Ctx, done: Map<string, Done>, slots: Record<string, Scene>): SlotAssets {
  const src = (rel: string) => `packs/${ctx.packId}/${rel}`;
  const okOut = (f: string) => {
    const d = done.get(f);
    return d?.status === "OK" && d.outRel ? d : undefined;
  };
  const music: SlotAssets["music"] = {};
  for (const id of ["M1", "M2"]) {
    const d = okOut(`music/${id}.mp3`);
    if (d?.durationSec) music[id] = { src: src(d.outRel as string), durationSec: d.durationSec, label: musicLabel(rowFor(ctx.byStem, `music/${id}.mp3`), id) };
  }
  const sfx: SlotAssets["sfx"] = {};
  for (const id of ["whoosh", "pop"]) {
    const d = okOut(`sfx/${id}.wav`);
    if (d?.durationSec) sfx[id] = { src: src(d.outRel as string), durationSec: d.durationSec };
  }
  const provenance: SlotAssets["provenance"] = {};
  for (const [canonical, rel] of ctx.scan.found) {
    if (canonical === "pack.csv") continue;
    const r = rowFor(ctx.byStem, canonical);
    provenance[rel] = {
      tool: r?.tool || "unknown", model: r?.model ?? "", prompt: r?.prompt ?? "", created: r?.created ?? "",
      ...(r?.text ? { text: r.text } : {}), ...(r?.kind ? { kind: r.kind } : {}), ...(r?.slot ? { slot: r.slot } : {}),
    };
  }
  // deterministic: newest pack.csv `created` date, else pack.csv mtime
  const dates = ctx.csvRows.map((r) => r.created).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d ?? "")).sort();
  const csvRel = ctx.scan.found.get("pack.csv");
  const createdAt = dates[dates.length - 1] ?? (csvRel ? fs.statSync(path.join(ctx.root, csvRel)).mtime.toISOString() : new Date().toISOString());
  const packshot = okOut("brand/packshot.png");
  const logo = okOut("brand/logo.png");
  return {
    pack: { id: ctx.packId, provenance: ctx.provenance, createdAt },
    brand: { name: BRAND_NAME, packshotSrc: packshot ? src(packshot.outRel as string) : "", ...(logo ? { logoSrc: src(logo.outRel as string) } : {}) },
    slots, music, sfx, provenance,
  };
}

/** Everything that must hold before the live pack + slot-assets.json are replaced. */
function viabilityProblems(assets: SlotAssets, sizes: { file: string; bytes: number }[]): string[] {
  const problems: string[] = [];
  if (!assets.brand.packshotSrc) problems.push("brand/packshot.png not usable");
  for (const [kind, ids] of [["hook", HOOK_IDS], ["body", BODY_IDS], ["cta", CTA_IDS]] as const) {
    if (!ids.some((id) => assets.slots[id])) problems.push(`no valid ${kind} slot`);
  }
  const parsed = SlotAssetsSchema.safeParse(assets);
  if (!parsed.success) problems.push(`SlotAssetsSchema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const over = sizes.filter((s) => s.bytes > BUDGET.perFileMb * 1048576).map((s) => s.file);
  if (over.length) problems.push(`files over ${BUDGET.perFileMb} MB: ${over.join(", ")}`);
  if (sizes.reduce((a, s) => a + s.bytes, 0) > BUDGET.packMb * 1048576) problems.push(`pack over ${BUDGET.packMb} MB`);
  return problems;
}

/** Swap staging → public/packs/<id>, drop other packs (unless keepOthers), write data/slot-assets.json. */
function swapDir(parent: string, staging: string, packId: string, keepOthers: boolean): void {
  const live = path.join(parent, packId);
  fs.rmSync(live, { recursive: true, force: true });
  if (fs.existsSync(staging)) renameWithRetry(staging, live);
  if (!keepOthers && fs.existsSync(parent)) {
    for (const d of fs.readdirSync(parent)) {
      if (d !== packId && fs.statSync(path.join(parent, d)).isDirectory()) fs.rmSync(path.join(parent, d), { recursive: true, force: true });
    }
  }
}

/** Swap staging → public/packs/<id> (+ media-cache/<id> mezzanine), drop other packs (unless keepOthers), write data/slot-assets.json. */
function publish(packsDir: string, staging: string, mezzStaging: string, packId: string, keepOthers: boolean, assets: SlotAssets): void {
  swapDir(packsDir, staging, packId, keepOthers);
  swapDir(path.dirname(mezzStaging), mezzStaging, packId, keepOthers);
  const out = path.join(process.cwd(), "data", "slot-assets.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(SlotAssetsSchema.parse(assets), null, 2) + "\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const pack = openPack(opts.input);
  const cwd = process.cwd();
  const packsDir = path.join(cwd, "public", "packs");
  let staging = "";
  let mezzStaging = "";
  try {
    const scan = scanTree(pack.root);
    const { rows: csvRows, byStem } = readPackCsv(pack.root, scan);
    const provenance = csvRows.some((r) => (r.provenance ?? "").toLowerCase() === "synthetic") ? "synthetic" : "pre-generated";
    const packId = opts.id ?? (provenance === "synthetic" ? "synthetic" : "norda");
    const ctx: Ctx = { root: pack.root, scan, csvRows, byStem, packId, provenance };
    log(`pack ${posix(path.relative(cwd, opts.input)) || opts.input} → id ${packId} (${provenance}), root ${posix(path.relative(cwd, pack.root)) || "."}`);

    fs.mkdirSync(packsDir, { recursive: true });
    for (const d of fs.readdirSync(packsDir)) if (d.startsWith(".staging-")) fs.rmSync(path.join(packsDir, d), { recursive: true, force: true });
    staging = path.join(packsDir, `.staging-${packId}`);
    fs.mkdirSync(staging, { recursive: true });
    mezzStaging = path.join(cwd, "media-cache", `.staging-${packId}`);
    fs.rmSync(mezzStaging, { recursive: true, force: true });

    const done = await processAll(pack.root, scan, byStem, staging, mezzStaging);
    const built = buildSlots(done, byStem, (rel) => `packs/${packId}/${rel}`);
    const files = fileRows(scan, done, csvRows.length, provenance);
    const assets = assembleAssets(ctx, done, built.slots);
    const sizes = dirSizes(staging);
    const problems = viabilityProblems(assets, sizes);
    const viable = problems.length === 0;
    const okSlots = built.rows.filter((r) => r.status === "OK").length;
    const slotsNote = `${okSlots}/${built.rows.length} slots OK`;
    const outcome = opts.dryRun
      ? `dry run (${viable ? "would be written" : `NOT viable: ${problems.join("; ")}`}), ${slotsNote}`
      : viable ? `written: public/packs/${packId}, data/slot-assets.json (${slotsNote})` : `NOT written (previous state kept): ${problems.join("; ")}`;
    const report = renderReport({
      source: posix(path.relative(cwd, pack.source)) || pack.source, packId, provenance, root: pack.root,
      missingRequired: scan.missingRequired.map((e) => e.file), missingOptional: scan.missingOptional.map((e) => e.file),
      extra: scan.extra, files, slots: built.rows, sizes, budget: BUDGET, outcome, ffmpeg: await ffmpegVersion(),
    });

    if (!opts.dryRun && viable) {
      publish(packsDir, staging, mezzStaging, packId, opts.keepOthers, assets);
      staging = "";
      mezzStaging = "";
    }
    const reportPath = opts.report ? path.resolve(opts.report) : opts.dryRun ? "" : path.join(cwd, "docs", "INGEST_REPORT.md");
    if (reportPath) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, report);
    } else process.stdout.write(report);

    const fails = files.filter((f) => f.status === "FAIL" || f.status === "MISSING").length;
    const truth = built.rows.map((r) => r.truthMaxErrMs).filter((x): x is number => x !== null);
    const totalMb = (sizes.reduce((a, s) => a + s.bytes, 0) / 1048576).toFixed(2);
    log(`${files.filter((f) => f.status === "OK").length} OK, ${fails} FAIL/MISSING; slots ${okSlots}/${built.rows.length}; ${totalMb} MB` +
      (truth.length ? `; max word error vs truth ${Math.round(Math.max(...truth))} ms` : "") + ` (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    log(outcome);
    if (reportPath) log(`report: ${posix(path.relative(cwd, reportPath))}`);
    if (!viable) process.exitCode = 1;
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    if (mezzStaging) fs.rmSync(mezzStaging, { recursive: true, force: true });
    pack.cleanup();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`[ingest] FAILED: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});

/**
 * npm run make:pack [-- --force] [--voice auto|sapi|tones] [--out <dir>]
 *
 * Writes a SYNTHETIC asset pack with the exact tree of docs/ASSET_PACK.md §1 (default inbox/synthetic-pack/):
 * procedural 9:16 clips (slot id drawn in a pixel font + "SYNTHETIC" tag), an RGBA bottle packshot,
 * 7 voice lines (offline Windows SAPI with word events → <slot>.words.json; fallback: tone bursts with
 * <slot>.truth.json and NO words.json), 2 procedural music loops, 2 SFX and pack.csv (provenance=synthetic).
 * Deterministic and idempotent: a second run is a no-op unless --force (or a different --voice) is given.
 */
import fs from "node:fs";
import path from "node:path";
import { LEAD_SEC, SLOT_MAX_SEC, TAIL_SEC } from "../src/contract";
import { ffmpeg, ffmpegWriter, probe, probeDuration } from "../src/lib/media/ffmpeg";
import { encodePng } from "../src/lib/media/png";
import { encodeWav, parseWav } from "../src/lib/media/wav";
import { csvRecords, toCsv } from "../src/lib/media/csv";
import { CANONICAL_TEXTS, PACK_CSV_COLUMNS } from "../src/lib/media/pack-spec";
import { ClipRenderer, CLIP_FPS, CLIP_SEC, type ClipSpec } from "../src/lib/media/synth-video";
import { renderBottle } from "../src/lib/media/bottle";
import { musicM1, musicM2, sfxPop, sfxWhoosh, SR, toneVoice, TONE_LEAD_SEC, type Stereo } from "../src/lib/media/synth-audio";
import { listSapiVoices, pickVoice, speakAll, SAPI_RATE_HZ } from "../src/lib/media/sapi";
import { detectSpeechSegments } from "../src/lib/media/vad";

const GENERATOR_VERSION = 4;
const TOOL = "make-synthetic-pack (Node procedural)";
const MAX_CLIP_BYTES = 2 * 1024 * 1024;

type VoiceMode = "auto" | "sapi" | "tones";
type Word = { word: string; startMs: number; endMs: number };
type Stamp = { generator: string; version: number; voice: "sapi" | "tones"; voiceName: string; created: string };

const CLIPS: (ClipSpec & { file: string })[] = [
  { file: "hooks/H1.mp4", id: "H1", role: "hook · question", colors: ["#ff7a18", "#ffd36b", "#fff4c2"], motion: "sun", bottle: false },
  { file: "hooks/H2.mp4", id: "H2", role: "hook · demo", colors: ["#06122b", "#123f6b", "#8fe3ff"], motion: "ice", bottle: true },
  { file: "hooks/H3.mp4", id: "H3", role: "hook · ugc", colors: ["#f6d9b8", "#e98f6f", "#2bb3a3"], motion: "handheld", bottle: true },
  { file: "bodies/B1a.mp4", id: "B1a", role: "body · proof", colors: ["#2a1606", "#c46a12", "#ffd089"], motion: "pushin", bottle: true },
  { file: "bodies/B1b.mp4", id: "B1b", role: "body · proof", colors: ["#1a1a1f", "#8c1c2b", "#ff5d6c"], motion: "stripes", bottle: true },
  { file: "bodies/B2a.mp4", id: "B2a", role: "body · durability", colors: ["#3b4045", "#7d858c", "#4da3ff"], motion: "bounce", bottle: true },
  { file: "bodies/B2b.mp4", id: "B2b", role: "body · durability", colors: ["#ff9a3c", "#4b2a6b", "#ffe08a"], motion: "slide", bottle: true },
];

const VOICES: { slot: string; file: string }[] = [
  { slot: "H1", file: "hooks/H1.mp3" },
  { slot: "H2", file: "hooks/H2.mp3" },
  { slot: "H3", file: "hooks/H3.mp3" },
  { slot: "B1", file: "bodies/B1.mp3" },
  { slot: "B2", file: "bodies/B2.mp3" },
  { slot: "C1", file: "ctas/C1.mp3" },
  { slot: "C2", file: "ctas/C2.mp3" },
];

const OTHER_FILES = ["pack.csv", "brand/packshot.png", "music/M1.mp3", "music/M2.mp3", "sfx/whoosh.wav", "sfx/pop.wav"];

/* ───────────── cli ───────────── */

function parseArgs(argv: string[]) {
  const o = { force: false, voice: "auto" as VoiceMode, out: "inbox/synthetic-pack" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") o.force = true;
    else if (a === "--voice") o.voice = argv[++i] as VoiceMode;
    else if (a.startsWith("--voice=")) o.voice = a.slice(8) as VoiceMode;
    else if (a === "--out") o.out = argv[++i];
    else if (a.startsWith("--out=")) o.out = a.slice(6);
    else throw new Error(`unknown argument ${a} (use --force, --voice auto|sapi|tones, --out <dir>)`);
  }
  if (!["auto", "sapi", "tones"].includes(o.voice)) throw new Error(`--voice must be auto|sapi|tones, got ${o.voice}`);
  return o;
}

const log = (msg: string) => process.stdout.write(`[make:pack] ${msg}\n`);
const mkdirFor = (file: string) => fs.mkdirSync(path.dirname(file), { recursive: true });
const today = () => new Date().toISOString().slice(0, 10);

/* ───────────── encoders ───────────── */

async function writeMp3(pcm: Float32Array[], sampleRate: number, file: string, channels: 1 | 2): Promise<void> {
  mkdirFor(file);
  await ffmpeg(["-v", "error", "-f", "wav", "-i", "-", "-ar", "44100", "-ac", String(channels), "-c:a", "libmp3lame", "-b:a", "128k", file], encodeWav(pcm, sampleRate));
}

function writeStereoWav(s: Stereo, file: string): void {
  mkdirFor(file);
  fs.writeFileSync(file, encodeWav([s.left, s.right], SR));
}

async function encodeClip(spec: ClipSpec, sprite: ReturnType<typeof renderBottle>, file: string): Promise<{ bytes: number; crf: number }> {
  mkdirFor(file);
  for (const crf of [26, 30, 34]) {
    const r = new ClipRenderer(spec, spec.bottle ? sprite : null);
    const w = ffmpegWriter([
      "-v", "error", "-f", "image2pipe", "-c:v", "bmp", "-framerate", String(CLIP_FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(CLIP_FPS),
      "-movflags", "+faststart", "-an", file,
    ]);
    for (let f = 0; f < CLIP_FPS * CLIP_SEC; f++) await w.write(r.frameBmp(f));
    await w.end();
    const bytes = fs.statSync(file).size;
    if (bytes <= MAX_CLIP_BYTES) return { bytes, crf };
  }
  throw new Error(`${file} stays above ${MAX_CLIP_BYTES} bytes even at crf 34`);
}

/* ───────────── voices ───────────── */

/** Last 5 ms window in [fromMs, toMs) whose RMS is above thresholdDb (ms at its end), or null. */
function lastActiveMs(pcm: Float32Array, sr: number, fromMs: number, toMs: number, thresholdDb: number): number | null {
  const win = Math.round(sr * 0.005);
  for (let e = Math.min(pcm.length, Math.floor((toMs / 1000) * sr)); e - win >= Math.floor((fromMs / 1000) * sr); e -= win) {
    let acc = 0;
    for (let i = e - win; i < e; i++) acc += pcm[i] * pcm[i];
    if (10 * Math.log10(acc / win + 1e-20) >= thresholdDb) return (e / sr) * 1000;
  }
  return null;
}

const maxVoiceSpanSec = (slot: string) => SLOT_MAX_SEC[CANONICAL_TEXTS[slot].slot] - LEAD_SEC - TAIL_SEC - 0.1;

type VoiceOut = { slot: string; words: Word[]; spanSec: number };

/** Align one SAPI line: speech onset → TONE_LEAD_SEC, cut 0.3 s after offset, word starts from events, ends from energy. */
function alignSapiLine(text: string, pcm: Float32Array, events: { audioMs: number; charPos: number }[]) {
  const sr = SAPI_RATE_HZ;
  const segs = detectSpeechSegments(pcm, sr, { thresholdDb: -40 });
  if (segs.length === 0) throw new Error("SAPI produced silence");
  const onset = segs[0].startMs;
  const offset = segs[segs.length - 1].endMs;
  const tokens = [...text.matchAll(/\S+/g)].map((m) => ({ word: m[0], from: m.index ?? 0, to: (m.index ?? 0) + m[0].length }));
  const starts: (number | null)[] = tokens.map((t) => {
    const ev = events.find((e) => e.charPos >= t.from && e.charPos < t.to);
    return ev ? ev.audioMs : null;
  });
  if (starts[0] === null) starts[0] = onset;
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] !== null) continue;
    const next = starts.slice(i).find((s): s is number => s !== null) ?? offset;
    starts[i] = ((starts[i - 1] as number) + next) / 2;
  }
  const s = starts as number[];
  s[0] = Math.max(s[0], onset - 30);
  const words: Word[] = tokens.map((t, i) => {
    const next = i + 1 < s.length ? s[i + 1] : offset;
    const end = i + 1 < s.length ? Math.min(next - 15, lastActiveMs(pcm, sr, s[i] + 60, next, -42) ?? next - 15) : offset;
    return { word: t.word, startMs: s[i], endMs: Math.max(s[i] + 40, end) };
  });
  const shift = TONE_LEAD_SEC * 1000 - onset;
  const from = Math.max(0, Math.round(((onset - TONE_LEAD_SEC * 1000) / 1000) * sr));
  const pad = Math.max(0, Math.round(((TONE_LEAD_SEC * 1000 - onset) / 1000) * sr));
  const until = Math.min(pcm.length, Math.round(((offset + 300) / 1000) * sr));
  const out = new Float32Array(pad + (until - from));
  out.set(pcm.subarray(from, until), pad);
  return {
    pcm: out,
    spanSec: (offset - onset) / 1000,
    words: words.map((w) => ({ word: w.word, startMs: Math.round(w.startMs + shift), endMs: Math.round(w.endMs + shift) })),
  };
}

async function makeSapiVoices(out: string): Promise<{ voiceName: string; results: VoiceOut[] }> {
  const voices = await listSapiVoices();
  log(`SAPI voices: ${voices.map((v) => `${v.name} (${v.culture}, ${v.gender})`).join("; ") || "none"}`);
  const voice = pickVoice(voices);
  if (!voice) throw new Error("no installed SAPI voice");
  const rates = Object.fromEntries(VOICES.map((v) => [v.slot, 1]));
  const done = new Map<string, VoiceOut>();
  for (let round = 0; round < 4 && done.size < VOICES.length; round++) {
    const todo = VOICES.filter((v) => !done.has(v.slot));
    const res = await speakAll(voice.name, todo.map((v) => ({ key: v.slot, text: CANONICAL_TEXTS[v.slot].text, rate: rates[v.slot] })));
    for (const r of res) {
      const spec = VOICES.find((v) => v.slot === r.key);
      if (!spec) continue;
      const pcm = parseWav(fs.readFileSync(r.wavPath)).mono;
      const aligned = alignSapiLine(CANONICAL_TEXTS[r.key].text, pcm, r.events);
      if (aligned.spanSec > maxVoiceSpanSec(r.key) && rates[r.key] < 5) {
        log(`${r.key}: ${aligned.spanSec.toFixed(2)} s at rate ${rates[r.key]} exceeds the slot budget, retrying faster`);
        rates[r.key] += 1;
        continue;
      }
      const file = path.join(out, spec.file);
      await writeMp3([aligned.pcm], SAPI_RATE_HZ, file, 1);
      fs.writeFileSync(file.replace(/\.mp3$/, ".words.json"), JSON.stringify(aligned.words, null, 1) + "\n");
      done.set(r.key, { slot: r.key, words: aligned.words, spanSec: aligned.spanSec });
    }
    fs.rmSync(path.dirname(res[0].wavPath), { recursive: true, force: true });
  }
  if (done.size < VOICES.length) throw new Error("SAPI lines could not be fitted into the slot limits");
  return { voiceName: voice.name, results: VOICES.map((v) => done.get(v.slot) as VoiceOut) };
}

async function makeToneVoices(out: string): Promise<VoiceOut[]> {
  const res: VoiceOut[] = [];
  for (const v of VOICES) {
    const { pcm, truth } = toneVoice(CANONICAL_TEXTS[v.slot].text, v.slot, maxVoiceSpanSec(v.slot));
    const file = path.join(out, v.file);
    await writeMp3([pcm], SR, file, 1);
    fs.writeFileSync(file.replace(/\.mp3$/, ".truth.json"), JSON.stringify(truth, null, 1) + "\n");
    res.push({ slot: v.slot, words: truth, spanSec: (truth[truth.length - 1].endMs - truth[0].startMs) / 1000 });
  }
  return res;
}

/* ───────────── pack.csv ───────────── */

function writePackCsv(out: string, voiceTool: string, voiceModel: string, created: string): void {
  const templatePath = path.join(process.cwd(), "docs", "pack_template.csv");
  const template = fs.existsSync(templatePath) ? csvRecords(fs.readFileSync(templatePath, "utf8")) : [];
  const byFile = new Map(template.map((r) => [r.file, r]));
  const files = ["brand/packshot.png", ...CLIPS.map((c) => c.file), ...VOICES.map((v) => v.file), "music/M1.mp3", "music/M2.mp3", "sfx/whoosh.wav", "sfx/pop.wav"];
  const order = template.map((r) => r.file).filter((f) => files.includes(f));
  for (const f of files) if (!order.includes(f)) order.push(f);
  const rows = order.map((file) => {
    const t = byFile.get(file);
    const voice = VOICES.find((v) => v.file === file);
    const kind = file.endsWith(".png") ? "image" : file.startsWith("music/") ? "music" : file.startsWith("sfx/") ? "sfx" : voice ? "voice" : "video";
    const tool = kind === "voice" ? voiceTool : TOOL;
    const model = {
      image: "procedural bottle renderer (anti-aliased SDF profile)",
      video: "procedural frames -> libx264 (Remotion bundled ffmpeg)",
      voice: voiceModel,
      music: "procedural synth (kick/clap/hats/bass/pad)",
      sfx: "procedural synth",
    }[kind] as string;
    const slot = t?.slot ?? (voice ? voice.slot : kind.toUpperCase());
    return {
      file, slot, kind, tool, model,
      prompt: t?.prompt ?? "",
      text: t?.text || (voice ? CANONICAL_TEXTS[voice.slot].text : ""),
      onScreen: t?.onScreen || (voice ? CANONICAL_TEXTS[voice.slot].onScreen ?? "" : ""),
      created,
      provenance: "synthetic",
    };
  });
  fs.writeFileSync(path.join(out, "pack.csv"), toCsv(PACK_CSV_COLUMNS, rows));
}

/* ───────────── main ───────────── */

function expectedFiles(voice: "sapi" | "tones"): string[] {
  const side = voice === "sapi" ? ".words.json" : ".truth.json";
  return [...OTHER_FILES, ...CLIPS.map((c) => c.file), ...VOICES.flatMap((v) => [v.file, v.file.replace(/\.mp3$/, side)])];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const out = path.resolve(opts.out);
  const stampPath = path.join(out, ".make-pack.json");
  const t0 = Date.now();

  if (!opts.force && fs.existsSync(stampPath)) {
    const stamp = JSON.parse(fs.readFileSync(stampPath, "utf8")) as Stamp;
    const modeOk = opts.voice === "auto" || opts.voice === stamp.voice;
    const missing = expectedFiles(stamp.voice).filter((f) => !fs.existsSync(path.join(out, f)));
    if (stamp.version === GENERATOR_VERSION && modeOk && missing.length === 0) {
      log(`up to date (${path.relative(process.cwd(), out)}, voice=${stamp.voice}); use --force to regenerate`);
      return;
    }
  }
  fs.mkdirSync(out, { recursive: true });
  // remove only our own voice sidecars (switching sapi <-> tones must not leave stale timing files)
  for (const v of VOICES) for (const ext of [".words.json", ".truth.json"]) fs.rmSync(path.join(out, v.file.replace(/\.mp3$/, ext)), { force: true });

  const created = today();
  log("packshot: rendering 1600x2400 RGBA bottle");
  fs.mkdirSync(path.join(out, "brand"), { recursive: true });
  const shot = renderBottle(1, { shadow: true, seed: "packshot" });
  fs.writeFileSync(path.join(out, "brand", "packshot.png"), encodePng(shot.data, shot.width, shot.height, 4));

  const sprite = renderBottle(0.3, { seed: "sprite" });
  for (const c of CLIPS) {
    const r = await encodeClip(c, sprite, path.join(out, c.file));
    log(`${c.file}: ${(r.bytes / 1024).toFixed(0)} KB (crf ${r.crf})`);
  }

  let voiceMode: "sapi" | "tones" = opts.voice === "tones" || process.platform !== "win32" ? "tones" : "sapi";
  let voiceName = "none";
  let voices: VoiceOut[] = [];
  if (voiceMode === "sapi") {
    try {
      const r = await makeSapiVoices(out);
      voiceName = r.voiceName;
      voices = r.results;
    } catch (e) {
      if (opts.voice === "sapi") throw e;
      log(`SAPI failed (${(e as Error).message}); falling back to tone bursts`);
      voiceMode = "tones";
    }
  }
  if (voiceMode === "tones") voices = await makeToneVoices(out);
  for (const v of voices) log(`${v.slot}: ${v.words.length} words, speech span ${v.spanSec.toFixed(2)} s (${voiceMode})`);

  log("music + sfx");
  const m1 = musicM1();
  await writeMp3([m1.left, m1.right], SR, path.join(out, "music", "M1.mp3"), 2);
  const m2 = musicM2();
  await writeMp3([m2.left, m2.right], SR, path.join(out, "music", "M2.mp3"), 2);
  writeStereoWav(sfxWhoosh(), path.join(out, "sfx", "whoosh.wav"));
  writeStereoWav(sfxPop(), path.join(out, "sfx", "pop.wav"));

  const voiceTool = voiceMode === "sapi" ? "Windows SAPI (System.Speech, offline)" : "make-synthetic-pack (tone bursts)";
  writePackCsv(out, voiceTool, voiceMode === "sapi" ? voiceName : "none (tone bursts, not speech)", created);

  // sanity: every file must be ffprobe-valid
  for (const f of expectedFiles(voiceMode).filter((x) => /\.(mp4|mp3|wav|png)$/.test(x))) {
    const p = await probe(path.join(out, f));
    if (!/\.png$/.test(f) && !(probeDuration(p) > 0)) throw new Error(`${f}: ffprobe reports no duration`);
  }
  const stamp: Stamp = { generator: "make-synthetic-pack", version: GENERATOR_VERSION, voice: voiceMode, voiceName, created };
  fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 2) + "\n");
  const bytes = expectedFiles(voiceMode).reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0);
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${path.relative(process.cwd(), out) || out} (${(bytes / 1048576).toFixed(1)} MB, voice=${voiceMode}${voiceMode === "sapi" ? `, ${voiceName}` : ""})`);
}

main().catch((e: unknown) => {
  process.stderr.write(`[make:pack] FAILED: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});

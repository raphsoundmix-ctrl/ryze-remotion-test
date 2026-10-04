/**
 * Ingest of audio assets (RUNBOOK P2 steps 4-5): voice-over alignment (lead/tail), loudness normalisation,
 * word timings (words.json → srt → silence), music and SFX. Node-only.
 */
import fs from "node:fs";
import { parseSrt } from "@remotion/captions";
import { LEAD_SEC, SLOT_MAX_SEC, TAIL_SEC } from "../../contract";
import { audioStream, decodePcmMono, ffmpeg, ffmpegWithLog, probe, probeDuration } from "./ffmpeg";
import { integratedLoudness, normalizeLoudness } from "./loudness";
import { detectSpeechSegments, estimateWordTimings, type Segment } from "./vad";
import { encodeWav } from "./wav";

export type Word = { word: string; startMs: number; endMs: number };
export type TimingSource = "words.json" | "srt" | "silence";

export class IngestError extends Error {}

const VAD_RATE = 16000;
const OUT_RATE = 44100;
const VO_LUFS = -16;
const VO_PEAK_DB = -2;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;

/** Integrated loudness (LUFS) as measured by ffmpeg's loudnorm analysis pass. */
export async function measureLufs(file: string): Promise<number | null> {
  const r = await ffmpegWithLog(["-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
  const m = r.stderr.match(/"input_i"\s*:\s*"(-?[\d.]+|-inf)"/);
  return m && m[1] !== "-inf" ? Number(m[1]) : null;
}

/** VAD on a peak-normalised copy (the absolute -35 dBFS threshold must not depend on the delivered level). */
async function speechSegments(file: string): Promise<{ segments: Segment[]; durationMs: number }> {
  const pcm = await decodePcmMono(file, VAD_RATE);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak > 0) {
    const g = 0.89 / peak; // -1 dBFS
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
  }
  return { segments: detectSpeechSegments(pcm, VAD_RATE), durationMs: (pcm.length / VAD_RATE) * 1000 };
}

/** Use the VO text tokens (with punctuation) when the counts match; otherwise keep the provided words. */
function onTokens(text: string, words: Word[]): Word[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length === words.length ? words.map((w, i) => ({ ...w, word: tokens[i] })) : words;
}

function validWords(words: Word[], durationMs: number): string | null {
  if (words.length === 0) return "empty";
  for (const w of words) {
    if (!w.word || !Number.isFinite(w.startMs) || !Number.isFinite(w.endMs)) return "non-numeric times";
    if (w.endMs <= w.startMs) return `"${w.word}" ends before it starts`;
    if (w.startMs < 0 || w.endMs > durationMs + 50) return `"${w.word}" outside the audio`;
  }
  return null;
}

/** <slot>.words.json: [{word,startMs,endMs}] (also accepts {words:[…]}, text/start/end, seconds). */
export function parseWordsJson(raw: string): Word[] {
  const j = JSON.parse(raw) as unknown;
  const arr = (Array.isArray(j) ? j : (j as { words?: unknown[] })?.words) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(arr)) throw new Error("expected an array of words");
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const hasMs = arr.some((w) => "startMs" in w || "start_ms" in w);
  const words = arr.map((w) => {
    const word = String(w.word ?? w.text ?? "").trim();
    const s = hasMs ? num(w.startMs ?? w.start_ms) : num(w.start);
    const e = hasMs ? num(w.endMs ?? w.end_ms) : num(w.end);
    return { word, startMs: s, endMs: e };
  });
  const maxT = Math.max(...words.map((w) => w.endMs));
  const scale = !hasMs && maxT < 600 ? 1000 : 1; // start/end given in seconds
  return words.map((w) => ({ ...w, startMs: w.startMs * scale, endMs: w.endMs * scale })).sort((a, b) => a.startMs - b.startMs);
}

/** SRT is phrase-level: words split inside each cue by character weight; VO tokens re-spread if counts differ. */
export function srtWords(raw: string, text: string): Word[] {
  const { captions } = parseSrt({ input: raw });
  const cueWords: Word[] = captions.flatMap((c) => estimateWordTimings(c.text, [{ startMs: c.startMs, endMs: c.endMs }]));
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (cueWords.length === tokens.length) return onTokens(text, cueWords);
  return estimateWordTimings(text, captions.map((c) => ({ startMs: c.startMs, endMs: c.endMs })));
}

export type VoiceResult = {
  durationSec: number;
  words: Word[];
  timingSource: TimingSource;
  detail: string;
  /** max |error| (ms) of final word times vs <slot>.truth.json, when present */
  truthMaxErrMs: number | null;
  /** diagnostic: silence-path estimate vs the provided words.json (ms), when words.json is used */
  silenceVsJsonMaxErrMs: number | null;
};

const maxErr = (a: Word[], b: Word[]) =>
  a.length === b.length && a.length > 0
    ? Math.max(...a.map((w, i) => Math.max(Math.abs(w.startMs - b[i].startMs), Math.abs(w.endMs - b[i].endMs))))
    : null;

/**
 * Voice-over: cut/pad so the first word starts at exactly LEAD_SEC and audio ends TAIL_SEC after the last word,
 * -16 LUFS (BS.1770 gated gain + peak limiter, see loudness.ts), mp3 128k mono 44.1k. Throws IngestError on policy failures.
 */
export async function processVoice(opts: {
  input: string;
  output: string;
  slotKind: keyof typeof SLOT_MAX_SEC;
  text: string;
  sidecars: { wordsJson?: string; srt?: string; truth?: string };
}): Promise<VoiceResult> {
  const p = await probe(opts.input);
  if (!audioStream(p)) throw new IngestError("no audio stream");
  const srcDur = probeDuration(p);
  const { segments, durationMs } = await speechSegments(opts.input);
  if (segments.length === 0) throw new IngestError("no speech detected (VAD -35 dBFS after peak normalisation)");

  let words: Word[] = [];
  let timingSource: TimingSource = "silence";
  const notes: string[] = [];
  if (opts.sidecars.wordsJson) {
    try {
      const w = onTokens(opts.text, parseWordsJson(fs.readFileSync(opts.sidecars.wordsJson, "utf8")));
      const bad = validWords(w, durationMs);
      if (bad) notes.push(`words.json ignored (${bad})`);
      else [words, timingSource] = [w, "words.json"];
    } catch (e) {
      notes.push(`words.json ignored (${(e as Error).message})`);
    }
  }
  if (words.length === 0 && opts.sidecars.srt) {
    try {
      const w = srtWords(fs.readFileSync(opts.sidecars.srt, "utf8"), opts.text);
      const bad = validWords(w, durationMs);
      if (bad) notes.push(`srt ignored (${bad})`);
      else [words, timingSource] = [w, "srt"];
    } catch (e) {
      notes.push(`srt ignored (${(e as Error).message})`);
    }
  }
  const silence = estimateWordTimings(opts.text, segments);
  if (words.length === 0) [words, timingSource] = [silence, "silence"];
  if (words.length === 0) throw new IngestError("no word timings could be derived");

  const onset = Math.min(segments[0].startMs, words[0].startMs);
  const offset = Math.max(segments[segments.length - 1].endMs, words[words.length - 1].endMs);
  const durationSec = r3(LEAD_SEC + (offset - onset) / 1000 + TAIL_SEC);
  const limit = SLOT_MAX_SEC[opts.slotKind];
  if (durationSec > limit + 1e-6) {
    throw new IngestError(`duration ${durationSec.toFixed(2)} s (lead ${LEAD_SEC} + VO ${((offset - onset) / 1000).toFixed(2)} + tail ${TAIL_SEC}) > ${opts.slotKind} max ${limit} s`);
  }

  // cut/pad in samples (atrim/adelay/apad equivalent, done in Node so the timeline stays sample-exact),
  // then BS.1770 gated gain to -16 LUFS with a -2 dBFS sample-peak limiter (≈ -1.5 dBTP after mp3)
  const src = await decodePcmMono(opts.input, OUT_RATE);
  const total = Math.round(durationSec * OUT_RATE);
  const from = Math.max(0, Math.round((onset / 1000 - LEAD_SEC) * OUT_RATE));
  const pad = Math.max(0, Math.round((LEAD_SEC - onset / 1000) * OUT_RATE));
  const cut = new Float32Array(total);
  cut.set(src.subarray(from, Math.min(src.length, from + total - pad)), pad);
  // libmp3lame 128k loses ~0.4 LU on speech [measured]: re-target from the decoded mp3 (max 2 corrections)
  let target = VO_LUFS;
  let norm = normalizeLoudness(cut, OUT_RATE, target, VO_PEAK_DB);
  let encodedLufs = Number.NaN;
  for (let pass = 0; pass < 3; pass++) {
    await ffmpeg(["-v", "error", "-f", "wav", "-i", "-", "-ar", String(OUT_RATE), "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", opts.output], encodeWav([norm.pcm], OUT_RATE));
    encodedLufs = integratedLoudness([await decodePcmMono(opts.output, OUT_RATE)], OUT_RATE);
    if (!Number.isFinite(encodedLufs) || Math.abs(encodedLufs - VO_LUFS) < 0.15 || pass === 2) break;
    target += VO_LUFS - encodedLufs;
    norm = normalizeLoudness(cut, OUT_RATE, target, VO_PEAK_DB);
  }

  const shift = LEAD_SEC * 1000 - onset;
  const endCap = durationSec * 1000;
  let prev = 0;
  const final = words.map((w) => {
    const startMs = Math.max(prev, Math.round(w.startMs + shift));
    const endMs = Math.min(Math.round(endCap), Math.max(startMs + 1, Math.round(w.endMs + shift)));
    prev = startMs;
    return { word: w.word, startMs, endMs };
  });

  let truthMaxErrMs: number | null = null;
  if (opts.sidecars.truth) {
    const truth = parseWordsJson(fs.readFileSync(opts.sidecars.truth, "utf8")).map((w) => ({ ...w, startMs: w.startMs + shift, endMs: w.endMs + shift }));
    truthMaxErrMs = maxErr(final, truth);
    if (truthMaxErrMs === null) notes.push(`truth.json has ${truth.length} words vs ${final.length}`);
  }
  const silenceVsJsonMaxErrMs = timingSource === "words.json" ? maxErr(onTokens(opts.text, silence), words) : null;

  const out = await probe(opts.output);
  const outDur = probeDuration(out);
  const check = await speechSegments(opts.output);
  const onsetOut = check.segments[0]?.startMs ?? NaN;
  const lufs = await measureLufs(opts.output);
  const parts = [
    `${srcDur.toFixed(2)} s → ${durationSec.toFixed(2)} s (lead ${LEAD_SEC} + VO ${((offset - onset) / 1000).toFixed(2)} + tail ${TAIL_SEC}; mp3 container ${outDur.toFixed(2)} s incl. encoder padding)`,
    `${final.length} words, timing ${timingSource}`,
    `speech onset in output ${Math.round(onsetOut)} ms`,
    `${encodedLufs.toFixed(1)} LUFS (BS.1770 on the decoded mp3, gain ${norm.gainDb >= 0 ? "+" : ""}${norm.gainDb.toFixed(1)} dB)${lufs !== null ? `, ffmpeg loudnorm meter ${lufs.toFixed(1)}` : ""}`,
    `${mb(fs.statSync(opts.input).size)} → ${mb(fs.statSync(opts.output).size)}`,
  ];
  if (truthMaxErrMs !== null) parts.push(`max word error vs truth ${Math.round(truthMaxErrMs)} ms`);
  if (silenceVsJsonMaxErrMs !== null) parts.push(`silence-path estimate vs words.json max ${Math.round(silenceVsJsonMaxErrMs)} ms (diagnostic)`);
  return { durationSec, words: final, timingSource, truthMaxErrMs, silenceVsJsonMaxErrMs, detail: [...parts, ...notes].join("; ") };
}

const MIN_MUSIC_SEC = 18;

/** Music bed: loudnorm I=-20, ≤ 40 s, mp3 128k 44.1k (stereo kept). */
export async function processMusic(input: string, output: string): Promise<{ durationSec: number; detail: string }> {
  const p = await probe(input);
  const a = audioStream(p);
  if (!a) throw new IngestError("no audio stream");
  // The bed is not looped; the longest possible ad is ~17.5 s (4 + 9 + 3.5 + 1 s hold - transitions).
  if (probeDuration(p) < MIN_MUSIC_SEC) throw new IngestError(`music ${probeDuration(p).toFixed(1)} s < ${MIN_MUSIC_SEC} s minimum`);
  const ch = Math.min(2, a.channels ?? 2);
  await ffmpeg(["-v", "error", "-i", input, "-vn", "-t", "40", "-af", "loudnorm=I=-20:TP=-1.5:LRA=11,aresample=44100", "-ar", "44100", "-ac", String(ch), "-c:a", "libmp3lame", "-b:a", "128k", output]);
  const durationSec = r3(probeDuration(await probe(output)));
  const lufs = await measureLufs(output);
  return {
    durationSec,
    detail: `${probeDuration(p).toFixed(2)} s → ${durationSec.toFixed(2)} s, ${ch} ch, ${lufs !== null ? `${lufs.toFixed(1)} LUFS` : "loudness n/a"}, ${mb(fs.statSync(input).size)} → ${mb(fs.statSync(output).size)}`,
  };
}

/** SFX: 16-bit WAV 44.1k, ≤ 1.5 s. */
export async function processSfx(input: string, output: string): Promise<{ durationSec: number; detail: string }> {
  const p = await probe(input);
  const a = audioStream(p);
  if (!a) throw new IngestError("no audio stream");
  const ch = Math.min(2, a.channels ?? 2);
  await ffmpeg(["-v", "error", "-i", input, "-vn", "-t", "1.5", "-ar", "44100", "-ac", String(ch), "-c:a", "pcm_s16le", output]);
  const durationSec = r3(probeDuration(await probe(output)));
  return { durationSec, detail: `${probeDuration(p).toFixed(2)} s → ${durationSec.toFixed(2)} s wav, ${mb(fs.statSync(output).size)}` };
}

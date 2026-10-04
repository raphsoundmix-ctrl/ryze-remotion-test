/**
 * Procedural audio for the SYNTHETIC pack (pure math, no node imports): two instrumental loops,
 * two SFX and the tone-burst "voice" fallback with exact ground-truth word times.
 */
import { rngFor } from "./rng";

export const SR = 44100;

export type Stereo = { left: Float32Array; right: Float32Array };
type Word = { word: string; startMs: number; endMs: number };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function addMono(dst: Stereo, src: Float32Array, at: number, gain: number, pan = 0): void {
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const start = Math.round(at * SR);
  for (let i = 0; i < src.length; i++) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= dst.left.length) break;
    dst.left[j] += src[i] * gl;
    dst.right[j] += src[i] * gr;
  }
}

/* ── instruments (each returns a short mono buffer) ── */

function kick(punch = 1): Float32Array {
  const n = Math.round(0.42 * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 44 + 120 * Math.exp(-t * 32) * punch;
    ph += (2 * Math.PI * f) / SR;
    const click = i < 90 ? (1 - i / 90) * 0.35 : 0;
    out[i] = Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t * 7.5)) + click * Math.sin(i * 0.9);
  }
  return out;
}

function noiseHit(rnd: () => number, dur: number, decay: number, hp: number): Float32Array {
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  let prev = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    const h = w - prev * hp; // simple pre-emphasis high-pass
    prev = w;
    lp += 0.6 * (h - lp);
    out[i] = lp * Math.exp((-i / SR) * decay);
  }
  return out;
}

function clap(rnd: () => number): Float32Array {
  const n = Math.round(0.28 * SR);
  const out = new Float32Array(n);
  let bp = 0;
  let bp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = t < 0.03 ? Math.exp(-((t % 0.01) * 300)) : Math.exp(-(t - 0.03) * 18);
    const w = rnd() * 2 - 1;
    bp += 0.35 * (w - bp);
    bp2 += 0.35 * (bp - bp2);
    out[i] = (bp - bp2) * 2.4 * env + 0.25 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30);
  }
  return out;
}

/** Band-limited (additive) saw/square pluck with a one-pole low-pass sweep. */
function pluck(freq: number, dur: number, shape: "saw" | "square", bright: number, decay: number): Float32Array {
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  const harmonics = Math.max(1, Math.min(24, Math.floor(SR / 2 / freq) - 1));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 1; k <= harmonics; k++) {
      if (shape === "square" && k % 2 === 0) continue;
      v += Math.sin(2 * Math.PI * freq * k * t) / k;
    }
    const cutoff = clampNum(bright * Math.exp(-t * 6) + 0.04, 0.01, 0.95);
    lp += cutoff * (v - lp);
    const env = Math.min(1, t / 0.004) * Math.exp(-t * decay) * (i > n - 200 ? (n - i) / 200 : 1);
    out[i] = lp * env * 0.6;
  }
  return out;
}

function pad(freqs: number[], dur: number): Float32Array {
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 0.5);
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * t);
    out[i] = (v / freqs.length) * env;
  }
  return out;
}

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function finish(mix: Stereo, peakDb = -1): Stereo {
  let peak = 0;
  for (const ch of [mix.left, mix.right]) {
    for (let i = 0; i < ch.length; i++) {
      ch[i] = Math.tanh(ch[i] * 1.2);
      peak = Math.max(peak, Math.abs(ch[i]));
    }
  }
  const g = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 1;
  for (const ch of [mix.left, mix.right]) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return mix;
}

/** M1: ~100 bpm minimal beat (kick / clap / swung hats / sub bass / soft pad), 12 bars = 28.8 s, loops seamlessly. */
export function musicM1(): Stereo {
  const bpm = 100;
  const bars = 12;
  const step = 60 / bpm / 4;
  const len = bars * 16 * step;
  const mix: Stereo = { left: new Float32Array(Math.round(len * SR)), right: new Float32Array(Math.round(len * SR)) };
  const rnd = rngFor("M1");
  const K = kick();
  const C = clap(rnd);
  const roots = [57, 53, 48, 55]; // A3 F3 C3 G3 (bass two octaves down)
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 16 * step;
    const ci = bar % 4;
    for (const s of [0, 7, 10]) addMono(mix, K, b0 + s * step, 0.9);
    for (const s of [4, 12]) addMono(mix, C, b0 + s * step, 0.5, 0.1);
    for (let s = 0; s < 16; s += 2) {
      const swing = s % 4 === 2 ? step * 0.18 : 0;
      addMono(mix, noiseHit(rnd, 0.06, 55, 0.95), b0 + s * step + swing, s % 4 === 0 ? 0.22 : 0.14, 0.35);
    }
    for (const s of [0, 3, 10]) addMono(mix, pluck(mtof(roots[ci] - 24), step * 2.6, "saw", 0.12, 5), b0 + s * step, 0.55);
    addMono(mix, pad(chords[ci].map(mtof), 16 * step), b0, 0.07, -0.2);
  }
  return finish(mix);
}

/** M2: ~120 bpm brighter electro-pop (four-on-the-floor, offbeat hats, octave bass, square arp, pumping), 15 bars = 30 s. */
export function musicM2(): Stereo {
  const bpm = 120;
  const bars = 15;
  const step = 60 / bpm / 4;
  const len = bars * 16 * step;
  const n = Math.round(len * SR);
  const music: Stereo = { left: new Float32Array(n), right: new Float32Array(n) };
  const drums: Stereo = { left: new Float32Array(n), right: new Float32Array(n) };
  const rnd = rngFor("M2");
  const K = kick(1.2);
  const C = clap(rnd);
  const prog = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C G Am F
  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 16 * step;
    const ch = prog[bar % 4];
    for (let s = 0; s < 16; s += 4) addMono(drums, K, b0 + s * step, 0.85);
    for (const s of [4, 12]) addMono(drums, C, b0 + s * step, 0.45, -0.1);
    for (let s = 2; s < 16; s += 4) addMono(drums, noiseHit(rnd, 0.16, 18, 0.97), b0 + s * step, 0.18, 0.3);
    for (let s = 0; s < 16; s++) addMono(drums, noiseHit(rnd, 0.04, 80, 0.97), b0 + s * step, 0.07, -0.35);
    for (let s = 0; s < 16; s += 2) {
      const note = ch[0] - 24 + (s % 4 === 2 ? 12 : 0);
      addMono(music, pluck(mtof(note), step * 1.8, "saw", 0.22, 7), b0 + s * step, 0.45);
    }
    for (let s = 0; s < 16; s++) {
      const note = ch[s % 3] + 12 + (s % 8 >= 6 ? 12 : 0);
      addMono(music, pluck(mtof(note), step * 1.5, "square", 0.5, 14), b0 + s * step, 0.13, s % 2 ? 0.4 : -0.4);
    }
    addMono(music, pad(ch.map((m) => mtof(m)), 16 * step), b0, 0.06);
  }
  // sidechain pump on the music bus from every kick (quarter notes)
  const beat = (60 / bpm) * SR;
  for (let i = 0; i < n; i++) {
    const ph = (i % beat) / beat;
    const pump = 0.45 + 0.55 * Math.min(1, ph / 0.45);
    music.left[i] = music.left[i] * pump + drums.left[i];
    music.right[i] = music.right[i] * pump + drums.right[i];
  }
  return finish(music);
}

/** Whoosh: noise through a resonant band-pass sweeping up then down, ~0.7 s, swelling envelope + pan sweep. */
export function sfxWhoosh(): Stereo {
  const dur = 0.7;
  const n = Math.round(dur * SR);
  const out: Stereo = { left: new Float32Array(n), right: new Float32Array(n) };
  const rnd = rngFor("whoosh");
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const t = i / dur / SR;
    const fc = 300 + 3800 * Math.sin(Math.PI * Math.pow(t, 0.8));
    const f = 2 * Math.sin((Math.PI * fc) / SR);
    const q = 0.35;
    const x = rnd() * 2 - 1;
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 2.2);
    const v = band * env * 0.9;
    const pan = -0.8 + 1.6 * t;
    out.left[i] = v * Math.cos(((pan + 1) * Math.PI) / 4);
    out.right[i] = v * Math.sin(((pan + 1) * Math.PI) / 4);
  }
  return finish(out, -3);
}

/** Pop: short sine with a fast downward pitch drop and a tiny click, 0.15 s. */
export function sfxPop(): Stereo {
  const dur = 0.15;
  const n = Math.round(dur * SR);
  const out: Stereo = { left: new Float32Array(n), right: new Float32Array(n) };
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (220 + 680 * Math.exp(-t * 60))) / SR;
    const v = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t * 32) + (i < 40 ? (1 - i / 40) * 0.3 : 0);
    out.left[i] = v;
    out.right[i] = v;
  }
  return finish(out, -3);
}

export const TONE_LEAD_SEC = 0.2;

/**
 * Tone-burst "voice": one burst per whitespace token (180–420 ms by character count, varying pitch),
 * 90–160 ms gaps (longest after sentence punctuation), 0.2 s lead, 0.3 s tail. Returns mono PCM + exact truth.
 */
export function toneVoice(text: string, seed: string, maxSpanSec: number): { pcm: Float32Array; truth: Word[] } {
  const rnd = rngFor(`tones-${seed}`);
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const letters = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "").length;
  let lens = tokens.map((t) => clampNum(150 + 42 * letters(t), 180, 420));
  const gaps = tokens.slice(0, -1).map((t) => (/[.!?]$/.test(t) ? 160 : /[,;:]$/.test(t) ? 140 : 90 + Math.round(rnd() * 40)));
  const span = () => lens.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  if (span() > maxSpanSec * 1000) {
    // keep inside the slot limit: shrink words proportionally (never below 180 ms)
    const g = gaps.reduce((a, b) => a + b, 0);
    const k = (maxSpanSec * 1000 - g) / lens.reduce((a, b) => a + b, 0);
    lens = lens.map((l) => Math.max(180, Math.floor(l * k)));
  }
  const truth: Word[] = [];
  let at = TONE_LEAD_SEC * 1000;
  tokens.forEach((w, i) => {
    truth.push({ word: w, startMs: at, endMs: at + lens[i] });
    at += lens[i] + (gaps[i] ?? 0);
  });
  const total = at + 300;
  const pcm = new Float32Array(Math.round((total / 1000) * SR));
  truth.forEach((w, i) => {
    const f0 = 150 + 90 * rnd() + (i % 3) * 25;
    const s0 = Math.round((w.startMs / 1000) * SR);
    const s1 = Math.round((w.endMs / 1000) * SR);
    const fade = Math.round(0.008 * SR);
    let ph = 0;
    for (let j = s0; j < s1; j++) {
      const t = (j - s0) / SR;
      ph += (2 * Math.PI * f0 * (1 + 0.03 * Math.sin(2 * Math.PI * 5 * t))) / SR;
      const env = Math.min(1, (j - s0) / fade, (s1 - j) / fade);
      pcm[j] = 0.3 * env * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) / 1.75;
    }
  });
  return { pcm, truth };
}

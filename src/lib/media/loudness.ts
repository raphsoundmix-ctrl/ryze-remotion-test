/**
 * ITU-R BS.1770-4 integrated loudness (K-weighting, 400 ms blocks / 100 ms hop, absolute -70 LUFS and
 * relative -10 LU gates) + gain-to-target with a look-ahead peak limiter. Pure, no node imports.
 * Used for voice-over: ffmpeg's single-pass loudnorm missed -16 LUFS by up to 4 LU on clips < 3 s [measured 2026-10-04].
 */

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

function kWeighting(fs: number): [Biquad, Biquad] {
  // libebur128 / pyloudnorm formulation, valid for any sample rate
  let K = Math.tan((Math.PI * 1681.974450955533) / fs);
  const Q1 = 0.7071752369554196;
  const Vh = Math.pow(10, 3.999843853973347 / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q1 + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q1 + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q1 + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q1 + K * K) / a0,
  };
  K = Math.tan((Math.PI * 38.13547087602444) / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q2 + K * K) / a0 };
  return [shelf, hp];
}

function filter(x: Float32Array, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** Integrated loudness in LUFS of one or more equally weighted channels (L/R/mono); -Infinity when all blocks are gated. */
export function integratedLoudness(channels: Float32Array[], fs: number): number {
  const [shelf, hp] = kWeighting(fs);
  const weighted = channels.map((c) => filter(Float32Array.from(filter(c, shelf)), hp));
  const n = channels[0]?.length ?? 0;
  const block = Math.round(0.4 * fs);
  const hop = Math.round(0.1 * fs);
  const z: number[] = [];
  for (let s = 0; s + block <= n; s += hop) {
    let acc = 0;
    for (const w of weighted) for (let i = s; i < s + block; i++) acc += w[i] * w[i];
    z.push(acc / block);
  }
  const lk = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const abs = z.filter((v) => lk(v) > -70);
  if (abs.length === 0) return -Infinity;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((v) => lk(v) > rel);
  return lk(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/**
 * Look-ahead peak limiter: needed gain min-filtered over ±window, moving-averaged over the window (never above
 * the needed gain, so no sample exceeds the ceiling), then a 60 ms linear release.
 */
function limit(x: Float32Array, fs: number, ceiling: number): Float32Array {
  const n = x.length;
  const L = Math.max(1, Math.round(0.01 * fs));
  // min-filter of the needed gain over ±L (sparse: only samples above the ceiling contribute)
  const m = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    if (a <= ceiling) continue;
    const need = ceiling / a;
    for (let j = Math.max(0, i - L); j <= Math.min(n - 1, i + L); j++) if (need < m[j]) m[j] = need;
  }
  // centred moving average over L+1 samples (running sum), then linear release
  const half = Math.floor(L / 2);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + m[i];
  const out = new Float32Array(n);
  const step = 1 / (0.06 * fs);
  let prev = 1;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    const g = Math.min((prefix[hi] - prefix[lo]) / (hi - lo), prev + step);
    prev = g;
    out[i] = x[i] * g;
  }
  return out;
}

/** Gain mono PCM to `targetLufs` with a sample-peak ceiling (dBFS); iterates because limiting lowers loudness. */
export function normalizeLoudness(
  pcm: Float32Array,
  fs: number,
  targetLufs: number,
  ceilingDb: number,
): { pcm: Float32Array; lufs: number; gainDb: number } {
  const input = integratedLoudness([pcm], fs);
  if (!Number.isFinite(input)) return { pcm, lufs: input, gainDb: 0 };
  const ceiling = Math.pow(10, ceilingDb / 20);
  let gainDb = targetLufs - input;
  let out = pcm;
  let lufs = input;
  for (let it = 0; it < 4; it++) {
    const g = Math.pow(10, gainDb / 20);
    const scaled = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) scaled[i] = pcm[i] * g;
    out = limit(scaled, fs, ceiling);
    lufs = integratedLoudness([out], fs);
    if (Math.abs(lufs - targetLufs) < 0.1) break;
    gainDb += targetLufs - lufs;
  }
  return { pcm: out, lufs, gainDb };
}

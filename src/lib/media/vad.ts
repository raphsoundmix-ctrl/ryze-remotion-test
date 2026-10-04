/**
 * Pure speech-activity + word-timing estimation. NO node imports: verify.tsx (and anything else) may import it.
 * Exports exactly: Segment, detectSpeechSegments, estimateWordTimings.
 */

export type Segment = { startMs: number; endMs: number };

type Word = { word: string; startMs: number; endMs: number };

const rmsDb = (pcm: Float32Array, from: number, to: number): number => {
  const a = Math.max(0, from);
  const b = Math.min(pcm.length, to);
  if (b <= a) return -Infinity;
  let acc = 0;
  for (let i = a; i < b; i++) acc += pcm[i] * pcm[i];
  return 10 * Math.log10(acc / (b - a) + 1e-20);
};

/**
 * Energy-based speech segments. RMS over ~10 ms windows against an absolute threshold (dB re full scale),
 * boundaries refined at 1 ms, gaps shorter than minSilenceMs merged, speech shorter than minSpeechMs dropped.
 */
export function detectSpeechSegments(
  pcm: Float32Array,
  sampleRate: number,
  opts: { thresholdDb?: number; minSilenceMs?: number; minSpeechMs?: number } = {},
): Segment[] {
  const threshold = opts.thresholdDb ?? -35;
  const minSilenceMs = opts.minSilenceMs ?? 80;
  const minSpeechMs = opts.minSpeechMs ?? 60;
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const sub = Math.max(1, Math.round(sampleRate * 0.001));
  const nWin = Math.ceil(pcm.length / win);
  const toMs = (sample: number) => Math.round((sample / sampleRate) * 10000) / 10;

  const raw: [number, number][] = []; // sample ranges
  let open = -1;
  for (let w = 0; w <= nWin; w++) {
    const active = w < nWin && rmsDb(pcm, w * win, (w + 1) * win) >= threshold;
    if (active && open < 0) open = w;
    if (!active && open >= 0) {
      // refine the onset: first 1 ms sub-window above threshold, searched from one window earlier
      let start = open * win;
      for (let s = Math.max(0, (open - 1) * win); s < (open + 1) * win; s += sub) {
        if (rmsDb(pcm, s, s + sub) >= threshold) {
          start = s;
          break;
        }
      }
      // refine the offset: last 1 ms sub-window above threshold, searched up to one window later
      let end = w * win;
      for (let s = Math.min(pcm.length, (w + 1) * win) - sub; s >= (w - 1) * win; s -= sub) {
        if (rmsDb(pcm, s, s + sub) >= threshold) {
          end = Math.min(pcm.length, s + sub);
          break;
        }
      }
      if (end > start) raw.push([start, end]);
      open = -1;
    }
  }

  const merged: Segment[] = [];
  for (const [s, e] of raw) {
    const seg = { startMs: toMs(s), endMs: toMs(e) };
    const last = merged[merged.length - 1];
    if (last && seg.startMs - last.endMs < minSilenceMs) last.endMs = Math.max(last.endMs, seg.endMs);
    else merged.push(seg);
  }
  return merged.filter((s) => s.endMs - s.startMs >= minSpeechMs);
}

const weightOf = (token: string) => (token.match(/[\p{L}\p{N}]/gu)?.length ?? 0) + 1;
const SENTENCE_END = /[.!?…]["')\]]*$/;
const CLAUSE_END = /[,;:—–]["')\]]*$/;

/* alignment costs (squared log duration ratio units) */
const SENTENCE_INSIDE_PENALTY = 0.5; // a sentence end inside a group (should sit on a pause)
const CLAUSE_INSIDE_PENALTY = 0.15;
const GAP_MERGE_PENALTY = 0.05; // × (gap / 200 ms)² for every pause swallowed inside a group
const UNPUNCTUATED_PAUSE_PENALTY = 0.4; // × min(1, gap / 500 ms) when a group ends on a pause after a word without punctuation
const MAX_TOKENS_PER_GROUP = 14;
const MAX_SEGMENTS_PER_GROUP = 8;

type Group = { t0: number; t1: number; s0: number; s1: number };

/**
 * Align tokens with segments: both sequences are cut into the same number of contiguous groups
 * (≥ 1 token and ≥ 1 segment each). A group's speech time should match its character weight at the
 * utterance's average rate; pauses swallowed inside a group, sentence/clause punctuation inside a
 * group and long pauses after unpunctuated words are penalised, so punctuation prefers segment boundaries and a word split by a stop consonant
 * ("Leak-proof") may span two segments.
 */
function align(tokens: string[], segs: Segment[]): Group[] {
  const N = tokens.length;
  const M = segs.length;
  const wPre = [0];
  const sentPre = [0];
  const clausePre = [0];
  tokens.forEach((t) => {
    wPre.push(wPre[wPre.length - 1] + weightOf(t));
    sentPre.push(sentPre[sentPre.length - 1] + (SENTENCE_END.test(t) ? 1 : 0));
    clausePre.push(clausePre[clausePre.length - 1] + (!SENTENCE_END.test(t) && CLAUSE_END.test(t) ? 1 : 0));
  });
  const lenPre = [0];
  const gapPre = [0];
  segs.forEach((s, k) => {
    lenPre.push(lenPre[lenPre.length - 1] + (s.endMs - s.startMs));
    const gap = k + 1 < M ? segs[k + 1].startMs - s.endMs : 0;
    gapPre.push(gapPre[gapPre.length - 1] + GAP_MERGE_PENALTY * (gap / 200) ** 2);
  });
  const rate = lenPre[M] / wPre[N]; // ms of speech per weight unit
  const cost = (t0: number, t1: number, s0: number, s1: number) => {
    const expected = (wPre[t1] - wPre[t0]) * rate;
    const actual = Math.max(1, lenPre[s1] - lenPre[s0]);
    const r = Math.log(actual / expected);
    return (
      r * r +
      (gapPre[s1 - 1] - gapPre[s0]) + // pauses between s0..s1-1
      SENTENCE_INSIDE_PENALTY * (sentPre[t1 - 1] - sentPre[t0]) + // punctuation on tokens t0..t1-2
      CLAUSE_INSIDE_PENALTY * (clausePre[t1 - 1] - clausePre[t0]) +
      (t1 < N && s1 < M && !SENTENCE_END.test(tokens[t1 - 1]) && !CLAUSE_END.test(tokens[t1 - 1])
        ? UNPUNCTUATED_PAUSE_PENALTY * Math.min(1, (segs[s1].startMs - segs[s1 - 1].endMs) / 500)
        : 0)
    );
  };
  const solve = (maxA: number, maxB: number): Group[] | null => {
    const INF = Number.POSITIVE_INFINITY;
    const dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 1).fill(INF));
    const from = Array.from({ length: N + 1 }, () => new Int32Array((M + 1) * 2));
    dp[0][0] = 0;
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= M; j++) {
        for (let a = 1; a <= Math.min(maxA, i); a++) {
          for (let b = 1; b <= Math.min(maxB, j); b++) {
            const prev = dp[i - a][j - b];
            if (prev === INF) continue;
            const c = prev + cost(i - a, i, j - b, j);
            if (c < dp[i][j]) {
              dp[i][j] = c;
              from[i][j * 2] = a;
              from[i][j * 2 + 1] = b;
            }
          }
        }
      }
    }
    if (dp[N][M] === INF) return null;
    const groups: Group[] = [];
    for (let i = N, j = M; i > 0; ) {
      const a = from[i][j * 2];
      const b = from[i][j * 2 + 1];
      groups.unshift({ t0: i - a, t1: i, s0: j - b, s1: j });
      i -= a;
      j -= b;
    }
    return groups;
  };
  return solve(MAX_TOKENS_PER_GROUP, MAX_SEGMENTS_PER_GROUP) ?? (solve(N, M) as Group[]);
}

/**
 * Spread a group's tokens over its segments by character weight, counting speech time only;
 * a word boundary close to a pause inside the group snaps onto that pause.
 */
function spreadOver(tokens: string[], segs: Segment[]): Word[] {
  const w = tokens.map(weightOf);
  const W = w.reduce((a, b) => a + b, 0);
  const C = [0];
  for (const s of segs) C.push(C[C.length - 1] + (s.endMs - s.startMs));
  const T = C[C.length - 1];
  const B = [0];
  w.forEach((x) => B.push(B[B.length - 1] + (T * x) / W));
  // gap-centric snapping: each pause inside the group pulls the nearest word boundary onto itself
  const snapped = new Set<number>();
  for (let k = 1; k < segs.length; k++) {
    let best = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (!snapped.has(i) && (best < 0 || Math.abs(B[i] - C[k]) < Math.abs(B[best] - C[k]))) best = i;
    }
    if (best < 0) break;
    const tol = 0.5 * Math.min(B[best] - B[best - 1], B[best + 1] - B[best]);
    if (Math.abs(B[best] - C[k]) <= tol && C[k] > B[best - 1] && C[k] < B[best + 1]) {
      B[best] = C[k];
      snapped.add(best);
    }
  }
  const toTime = (p: number, isStart: boolean) => {
    for (let k = 0; k < segs.length; k++) {
      const inside = isStart ? p < C[k + 1] || k === segs.length - 1 : p <= C[k + 1] || k === segs.length - 1;
      if (inside) return segs[k].startMs + Math.min(p - C[k], segs[k].endMs - segs[k].startMs);
    }
    return segs[segs.length - 1].endMs;
  };
  return tokens.map((t, i) => ({ word: t, startMs: toTime(B[i], true), endMs: toTime(B[i + 1], false) }));
}

/**
 * Word timings from text + speech segments. Tokens = text split on whitespace.
 * #segments === #tokens → 1:1. Otherwise tokens are distributed over segments by character weight
 * (alignment DP above: punctuation prefers segment boundaries; extra segments are merged into words),
 * then spread inside each group by character weight over its speech time.
 */
export function estimateWordTimings(text: string, segments: Segment[]): Word[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const segs = [...segments].filter((s) => s.endMs > s.startMs).sort((a, b) => a.startMs - b.startMs);
  if (tokens.length === 0 || segs.length === 0) return [];
  const words: Word[] =
    segs.length === tokens.length
      ? tokens.map((t, i) => ({ word: t, startMs: segs[i].startMs, endMs: segs[i].endMs }))
      : align(tokens, segs).flatMap((g) => spreadOver(tokens.slice(g.t0, g.t1), segs.slice(g.s0, g.s1)));
  // integer ms, sorted, strictly positive length
  let prevStart = 0;
  return words.map((w) => {
    const startMs = Math.max(prevStart, Math.round(w.startMs));
    const endMs = Math.max(startMs + 1, Math.round(w.endMs));
    prevStart = startMs;
    return { word: w.word, startMs, endMs };
  });
}

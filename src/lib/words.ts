import type { Word } from "../schema";

const TAIL_SEC = 0.35;
type Raw = Record<string, unknown>;

/** ~14 chars/sec of speech. [ASSUMPTION] only used when the provider returns no timings. */
export const estimateSpeechSec = (text: string) => Math.max(1.5, text.trim().length / 14);

export function evenWords(text: string, totalSec: number): Word[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.length + 1);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return tokens.map((t, i) => {
    const start = (acc / sum) * totalSec;
    acc += weights[i];
    return { text: t, startMs: Math.round(start * 1000), endMs: Math.round((acc / sum) * totalSec * 1000) };
  });
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const pick = (o: Raw, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};

/** fal docs type `timestamps` as list<void> (untyped), so accept every plausible shape. */
function fromWordList(raw: unknown[]): { text: string; s: number; e: number }[] {
  const out: { text: string; s: number; e: number }[] = [];
  for (const item of raw) {
    let text: unknown, s: unknown, e: unknown;
    if (Array.isArray(item) && item.length >= 3) [text, s, e] = item;
    else if (item && typeof item === "object") {
      const o = item as Raw;
      text = pick(o, ["text", "word", "token"]);
      s = pick(o, ["start", "start_time", "startTime", "start_seconds", "begin"]);
      e = pick(o, ["end", "end_time", "endTime", "end_seconds"]);
    }
    if (typeof text !== "string" || !text.trim()) continue; // drops spacing / audio events
    const sn = num(s), en = num(e);
    if (sn === undefined || en === undefined) continue;
    out.push({ text: text.trim(), s: sn, e: en });
  }
  return out;
}

/** ElevenLabs-style character alignment -> words. */
function fromCharAlignment(a: Raw): { text: string; s: number; e: number }[] {
  const chars = a.characters as string[] | undefined;
  const starts = (a.character_start_times_seconds ?? a.start_times) as number[] | undefined;
  const ends = (a.character_end_times_seconds ?? a.end_times) as number[] | undefined;
  if (!chars || !starts || !ends) return [];
  const out: { text: string; s: number; e: number }[] = [];
  let cur = "", s = 0, e = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (cur) out.push({ text: cur, s, e });
      cur = "";
    } else {
      if (!cur) s = starts[i];
      cur += c;
      e = ends[i];
    }
  });
  if (cur) out.push({ text: cur, s, e });
  return out;
}

function parseProvider(raw: unknown): Word[] | undefined {
  let items: { text: string; s: number; e: number }[] = [];
  if (Array.isArray(raw)) items = fromWordList(raw);
  else if (raw && typeof raw === "object") {
    const o = raw as Raw;
    items = fromCharAlignment((o.alignment as Raw) ?? o);
    if (!items.length && Array.isArray(o.words)) items = fromWordList(o.words);
  }
  if (!items.length) return undefined;
  const maxEnd = Math.max(...items.map((i) => i.e));
  const k = maxEnd > 600 ? 1 : 1000; // >600 => already ms (a 10-min scene is impossible)
  return items
    .map((i) => ({ text: i.text, startMs: Math.round(i.s * k), endMs: Math.round(Math.max(i.e, i.s) * k) }))
    .sort((a, b) => a.startMs - b.startMs);
}

export function normalizeWords(raw: unknown, text: string) {
  const parsed = parseProvider(raw);
  if (parsed?.length) {
    return { words: parsed, durationSec: parsed[parsed.length - 1].endMs / 1000 + TAIL_SEC, source: "provider" as const };
  }
  const speech = estimateSpeechSec(text);
  return { words: evenWords(text, speech), durationSec: speech + TAIL_SEC, source: "estimated" as const };
}

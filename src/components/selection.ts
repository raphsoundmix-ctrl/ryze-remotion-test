import { FORMATS, STYLES } from "../constants";
import type { Format, Manifest, SlotAssets, Style } from "../contract";
import { DEFAULT_AXES, slotIds, variantId } from "../lib/variants";

/** One point in the variant grid: the six axes the Playground exposes. */
export type Selection = {
  hook: string;
  body: string;
  cta: string;
  style: Style;
  format: Format;
  musicId: string | null;
};

const FORMAT_KEYS = Object.keys(FORMATS).filter((k): k is Format => k in FORMATS);
const isStyle = (t: string): t is Style => STYLES.some((s) => s === t);

export function initialSelection(a: SlotAssets): Selection | null {
  const { hooks, bodies, ctas } = slotIds(a);
  if (!hooks[0] || !bodies[0] || !ctas[0]) return null;
  return {
    hook: hooks[0],
    body: bodies[0],
    cta: ctas[0],
    style: DEFAULT_AXES.style,
    format: DEFAULT_AXES.format,
    musicId: a.music[DEFAULT_AXES.musicId] ? DEFAULT_AXES.musicId : null,
  };
}

export const selectionOf = (m: Manifest): Selection => ({
  hook: m.scenes[0].id,
  body: m.scenes[1].id,
  cta: m.scenes[2].id,
  style: m.style,
  format: m.format,
  musicId: m.music?.id ?? null,
});

/**
 * Inverse of `variantId()`: "H2_B1_C2_clean_m2_f45" -> Selection. Returns null for ids that do not
 * round-trip or reference slots/music missing from this pack, so a stale link never loads a wrong variant.
 */
export function parseVariantId(id: string, a: SlotAssets): Selection | null {
  const [hook, body, cta, ...rest] = id.split("_");
  if (!hook || !body || !cta) return null;
  if (a.slots[hook]?.slot !== "hook" || a.slots[body]?.slot !== "body" || a.slots[cta]?.slot !== "cta") return null;
  let style: Style = DEFAULT_AXES.style;
  let format: Format = DEFAULT_AXES.format;
  let musicId: string | null = DEFAULT_AXES.musicId;
  for (const t of rest) {
    const fmt = FORMAT_KEYS.find((k) => `f${k.replace("x", "")}` === t);
    if (isStyle(t)) style = t;
    else if (fmt) format = fmt;
    else if (t === "nomusic") musicId = null;
    else if (/^m\d+$/.test(t)) musicId = t.toUpperCase();
    else return null;
  }
  if (musicId && !a.music[musicId]) return null;
  const sel = { hook, body, cta, style, format, musicId };
  return variantId(hook, body, cta, sel) === id ? sel : null;
}

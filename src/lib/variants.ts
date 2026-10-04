/**
 * Variant engine: slot assets -> manifests. Pure and client-safe (the Playground runs it in the browser).
 * A variant is a point in the axis grid: hook x body x cta (x style x music x format).
 */
import { MUSIC_VOLUME } from "../constants";
import type { Format, Manifest, Scene, SlotAssets, Style } from "../contract";

export type VariantOpts = {
  style: Style;
  format: Format;
  musicId: string | null;
  /** Extra id suffixes are appended only for non-default axes, so the 12-variant core ids stay short. */
  defaults?: { style: Style; format: Format; musicId: string | null };
};

export const DEFAULT_AXES = { style: "hormozi", format: "9x16", musicId: "M1" } as const;

export function variantId(hook: string, body: string, cta: string, o: VariantOpts) {
  const d = o.defaults ?? DEFAULT_AXES;
  const parts = [hook, body, cta];
  if (o.style !== d.style) parts.push(o.style);
  if (o.musicId !== d.musicId) parts.push(o.musicId ? o.musicId.toLowerCase() : "nomusic");
  if (o.format !== d.format) parts.push(`f${o.format.replace("x", "")}`);
  return parts.join("_");
}

export function composeManifest(assets: SlotAssets, hook: string, body: string, cta: string, o: VariantOpts): Manifest {
  const pick = (id: string, slot: Scene["slot"]): Scene => {
    const s = assets.slots[id];
    if (!s) throw new Error(`slot ${id} not found in pack ${assets.pack.id}`);
    if (s.slot !== slot) throw new Error(`slot ${id} is a ${s.slot}, expected ${slot}`);
    return s;
  };
  const music = o.musicId ? assets.music[o.musicId] : undefined;
  const sfx = assets.sfx.whoosh || assets.sfx.pop
    ? { transition: assets.sfx.whoosh?.src, pop: assets.sfx.pop?.src }
    : null;
  return {
    schema: 2,
    variantId: variantId(hook, body, cta, o),
    style: o.style,
    format: o.format,
    brand: assets.brand,
    music: music && o.musicId ? { id: o.musicId, src: music.src, volume: MUSIC_VOLUME } : null,
    sfx,
    pack: { id: assets.pack.id, provenance: assets.pack.provenance },
    scenes: [pick(hook, "hook"), pick(body, "body"), pick(cta, "cta")],
  };
}

const idsOf = (assets: SlotAssets, slot: Scene["slot"]) =>
  Object.values(assets.slots).filter((s) => s.slot === slot).map((s) => s.id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

export const slotIds = (assets: SlotAssets) => ({
  hooks: idsOf(assets, "hook"),
  bodies: idsOf(assets, "body"),
  ctas: idsOf(assets, "cta"),
});

/**
 * Full factorial over hook x body x cta with the other axes held constant.
 * Holding style/music/format fixed is deliberate: one variable family per test, so metric
 * differences can be attributed to hook/body/cta main effects (see README "Iterate on metrics").
 */
export function enumerateVariants(assets: SlotAssets, o: VariantOpts = { ...DEFAULT_AXES }): Manifest[] {
  const { hooks, bodies, ctas } = slotIds(assets);
  const out: Manifest[] = [];
  for (const h of hooks) for (const b of bodies) for (const c of ctas) out.push(composeManifest(assets, h, b, c, o));
  return out;
}

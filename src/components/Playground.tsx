"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { FORMATS } from "../constants";
import type { Format, Manifest, Scene, SlotAssets, Style } from "../contract";
import { composeManifest, slotIds } from "../lib/variants";
import { AxisControl, type AxisOption } from "./AxisControl";
import { OPEN_VARIANT_EVENT, variantFromHash } from "./open-variant";
import { PlayerCard } from "./PlayerCard";
import { parseVariantId, selectionOf, type Selection } from "./selection";
import { VariantMatrix } from "./VariantMatrix";

const MUSIC_OFF = "off";
const FORMAT_ORDER: Format[] = ["9x16", "4x5", "1x1"];
const FORMAT_META: Record<Format, { label: string; sub: string }> = {
  "9x16": { label: "9:16", sub: "Reels · TikTok" },
  "4x5": { label: "4:5", sub: "Feed" },
  "1x1": { label: "1:1", sub: "Square" },
};
const STYLE_ORDER: Style[] = ["hormozi", "clean"];
const STYLE_META: Record<Style, { label: string; sub: string; tone: "accent" | "ice" }> = {
  hormozi: { label: "Hormozi", sub: "Caps, yellow word", tone: "accent" },
  clean: { label: "Clean", sub: "Pill, ice accent", tone: "ice" },
};

function AspectGlyph({ format }: { format: Format }) {
  const { width, height } = FORMATS[format];
  const h = 16;
  return <span aria-hidden="true" className="block rounded-[2px] border-[1.5px] border-current" style={{ width: (h * width) / height, height: h }} />;
}

const Swatch = ({ tone }: { tone: "accent" | "ice" }) => (
  <span aria-hidden="true" className={`block size-3 rounded-full ${tone === "ice" ? "bg-ice" : "bg-accent"}`} />
);

function RailLabel({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="eyebrow text-text">{title}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <span className="text-[12px] text-muted">{note}</span>
    </div>
  );
}

const sceneOption = (s: Scene, sub: string): AxisOption<string> => ({ value: s.id, label: s.id, sub, mono: true });

function musicOptions(assets: SlotAssets): AxisOption<string>[] {
  const tracks = Object.entries(assets.music)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, m]) => ({ value: id, label: id, sub: [m.label, `${m.durationSec.toFixed(0)} s`].filter(Boolean).join(" · "), mono: true }));
  return [...tracks, { value: MUSIC_OFF, label: "Off", sub: "VO + SFX only" }];
}

function Controls({ assets, sel, setSel }: { assets: SlotAssets; sel: Selection; setSel: Dispatch<SetStateAction<Selection>> }) {
  const ids = slotIds(assets);
  const slot = (id: string) => assets.slots[id];
  const set = <K extends keyof Selection>(key: K) => (value: Selection[K]) => setSel((s) => ({ ...s, [key]: value }));

  return (
    <div className="flex flex-col gap-5">
      <RailLabel title="Slots" note="hook → body → CTA" />
      <AxisControl
        label="Hook"
        meta={`${ids.hooks.length} takes · on-screen text`}
        options={ids.hooks.map((id) => sceneOption(slot(id), slot(id).onScreen ?? slot(id).text))}
        value={sel.hook}
        onChange={set("hook")}
        stackOnMobile
      />
      <AxisControl
        label="Body"
        meta={`${ids.bodies.length} takes`}
        options={ids.bodies.map((id) => sceneOption(slot(id), slot(id).text))}
        value={sel.body}
        onChange={set("body")}
        stackOnMobile
      />
      <AxisControl
        label="CTA"
        meta={`${ids.ctas.length} takes · end card`}
        options={ids.ctas.map((id) => sceneOption(slot(id), slot(id).text))}
        value={sel.cta}
        onChange={set("cta")}
        stackOnMobile
      />
      <div className="mt-2">
        <RailLabel title="Treatment" note="same assets, new look" />
      </div>
      <AxisControl
        label="Style"
        options={STYLE_ORDER.map((s) => ({ value: s, ...STYLE_META[s], lead: <Swatch tone={STYLE_META[s].tone} /> }))}
        value={sel.style}
        onChange={set("style")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <AxisControl
          label="Music"
          options={musicOptions(assets)}
          value={sel.musicId ?? MUSIC_OFF}
          onChange={(v) => setSel((s) => ({ ...s, musicId: v === MUSIC_OFF ? null : v }))}
        />
        <AxisControl
          label="Format"
          options={FORMAT_ORDER.map((f) => ({ value: f, ...FORMAT_META[f], mono: true, lead: <AspectGlyph format={f} /> }))}
          value={sel.format}
          onChange={set("format")}
        />
      </div>
    </div>
  );
}

const isNarrow = () => window.matchMedia("(max-width: 1023px)").matches;
const scrollBehavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** Selection state -> composeManifest() in memory -> Player. Also answers #v=<id> links and open-variant events. */
export function Playground({ assets, initial }: { assets: SlotAssets; initial: Selection }) {
  const [sel, setSel] = useState<Selection>(initial);
  const manifest = useMemo(() => composeManifest(assets, sel.hook, sel.body, sel.cta, sel), [assets, sel]);
  const monitorRef = useRef<HTMLElement>(null);

  const reveal = useCallback((always: boolean) => {
    if (always || isNarrow()) monitorRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, []);

  const pick = useCallback(
    (m: Manifest) => {
      setSel(selectionOf(m));
      reveal(false);
    },
    [reveal],
  );

  useEffect(() => {
    const load = (id: string | null) => {
      const next = id ? parseVariantId(id, assets) : null;
      if (!next) return;
      setSel(next);
      reveal(true);
    };
    const onHash = () => load(variantFromHash(window.location.hash));
    const onOpen = (e: Event) => {
      if (e instanceof CustomEvent && typeof e.detail === "string") load(e.detail);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    window.addEventListener(OPEN_VARIANT_EVENT, onOpen);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(OPEN_VARIANT_EVENT, onOpen);
    };
  }, [assets, reveal]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-12">
      <div className="order-2 min-w-0 lg:order-none">
        <Controls assets={assets} sel={sel} setSel={setSel} />
        <VariantMatrix assets={assets} selection={sel} activeId={manifest.variantId} onPick={pick} />
      </div>
      <div className="order-1 lg:order-none">
        <div className="lg:sticky lg:top-[calc(var(--header-h)_+_16px)]">
          <PlayerCard ref={monitorRef} manifest={manifest} />
        </div>
      </div>
    </div>
  );
}

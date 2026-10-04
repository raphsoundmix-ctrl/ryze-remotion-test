"use client";

import { useState } from "react";
import { FPS } from "../constants";
import type { Manifest, SlotAssets } from "../contract";
import { totalFrames } from "../lib/timing";
import { enumerateVariants, slotIds } from "../lib/variants";
import { fmtMs } from "./format";
import { GridIcon } from "./icons";
import type { Selection } from "./selection";

type Axes = Pick<Selection, "style" | "format" | "musicId">;
type Build = { variants: Manifest[]; ms: number; axes: Axes };

/** One column per body x CTA combination while that fits; a bigger pack falls back to auto-fill rows. */
const ROW_COLS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
const rowCols = (n: number) => ROW_COLS[n] ?? "sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]";

const sameAxes = (a: Axes, b: Axes) => a.style === b.style && a.format === b.format && a.musicId === b.musicId;
const firstWords = (text: string, n: number) => text.split(/\s+/).slice(0, n).join(" ");

function VariantCard({ m, active, onPick }: { m: Manifest; active: boolean; onPick: (m: Manifest) => void }) {
  const [hook, body, cta] = m.scenes;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPick(m)}
      className={`flex min-h-11 min-w-0 flex-col gap-1.5 rounded-md border p-2.5 text-left transition-[background-color,border-color] duration-150 ease-out active:translate-y-px ${
        active ? "border-accent/70 bg-accent/[0.08]" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
      }`}
    >
      <span className={`font-mono text-[12px] font-semibold ${active ? "text-accent" : "text-text"}`}>{m.variantId}</span>
      <span className="sr-only">Hook: {hook.onScreen ?? hook.text}.</span>
      <span className="line-clamp-1 text-[12px] text-muted">
        <span className="font-mono text-text/80">{body.id}</span> {firstWords(body.text, 4)}…
      </span>
      <span className="line-clamp-1 text-[12px] text-muted">
        <span className="font-mono text-text/80">{cta.id}</span> {cta.text}
      </span>
      <span className="font-mono text-[11px] text-muted">{(totalFrames(m) / FPS).toFixed(1)} s</span>
    </button>
  );
}

/** "Build all variants": full factorial over hook x body x CTA, composed in the browser and timed. */
export function VariantMatrix({
  assets,
  selection,
  activeId,
  onPick,
}: {
  assets: SlotAssets;
  selection: Selection;
  activeId: string;
  onPick: (m: Manifest) => void;
}) {
  const [build, setBuild] = useState<Build | null>(null);
  const ids = slotIds(assets);
  const count = ids.hooks.length * ids.bodies.length * ids.ctas.length;
  const axes: Axes = { style: selection.style, format: selection.format, musicId: selection.musicId };
  const stale = build !== null && !sameAxes(build.axes, axes);

  const run = () => {
    const t0 = performance.now();
    const variants = enumerateVariants(assets, axes);
    setBuild({ variants, ms: performance.now() - t0, axes });
  };

  return (
    <div className="mt-10 border-t border-line pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[46ch]">
          <h3 className="text-[19px] font-extrabold tracking-tight">
            {ids.hooks.length}×{ids.bodies.length}×{ids.ctas.length} = {count} variants
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Style, music and format stay fixed while hook, body and CTA vary, so a metric difference can be traced to one slot.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-[14px] font-extrabold text-on-accent transition-shadow duration-150 ease-out hover:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_28%,transparent)] active:translate-y-px"
        >
          <GridIcon size={16} />
          {build ? (stale ? "Rebuild for current axes" : "Rebuild all variants") : "Build all variants"}
        </button>
      </div>

      <output className="mt-3 block min-h-5 font-mono text-[12px] text-muted">
        {build
          ? `${build.variants.length} manifests composed in ${fmtMs(build.ms)} (performance.now, this browser)${stale ? " · axes changed since build" : ""}`
          : ""}
      </output>

      {build ? (
        <ol className="mt-3 flex flex-col gap-4">
          {ids.hooks.map((h) => {
            const row = build.variants.filter((m) => m.scenes[0].id === h);
            const scene = assets.slots[h];
            return (
              <li key={h} className="grid gap-2 lg:grid-cols-[132px_minmax(0,1fr)]">
                <div className="flex items-baseline gap-2 lg:flex-col lg:gap-1 lg:pt-2">
                  <span className="font-mono text-[13px] font-semibold text-accent">{h}</span>
                  <span className="text-[12px] font-extrabold uppercase leading-snug text-text">{scene.onScreen ?? scene.text}</span>
                </div>
                <div className={`grid grid-cols-2 gap-1.5 ${rowCols(row.length)}`}>
                  {row.map((m) => (
                    <VariantCard key={m.variantId} m={m} active={m.variantId === activeId} onPick={onPick} />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      <p className="mt-5 flex items-start gap-2 rounded-md border border-dashed border-line px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
        <span className="eyebrow mt-px shrink-0 text-text">Scale it</span>
        <span>
          <span className="font-mono text-text">5 hooks × 4 bodies × 5 CTAs = 100 variants</span> — same code, more rows in the pack.
        </span>
      </p>
    </div>
  );
}

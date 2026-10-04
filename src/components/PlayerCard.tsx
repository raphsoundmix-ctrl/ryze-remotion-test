"use client";

import dynamic from "next/dynamic";
import { useMemo, type Ref } from "react";
import { FORMATS, FPS } from "../constants";
import type { Manifest } from "../contract";
import { totalFrames } from "../lib/timing";
import { fmtMb } from "./format";
import { AlertIcon, CheckIcon } from "./icons";
import { useCacheState } from "./PackMedia";

function MonitorSkeleton() {
  return (
    <div className="flex aspect-[var(--ratio)] w-full items-center justify-center bg-black">
      <span className="eyebrow">Loading player</span>
    </div>
  );
}

const AdPlayer = dynamic(() => import("./AdPlayer"), { ssr: false, loading: MonitorSkeleton });

function CacheIndicator() {
  const s = useCacheState();
  const failed = s.failed.length;
  const done = s.status === "done";
  const summary = done
    ? failed
      ? `${failed} of ${s.total} assets failed to cache`
      : `assets cached ${fmtMb(s.bytes)}`
    : `caching assets ${s.settled}/${s.total}`;

  const tone = !done ? "text-muted" : failed ? "text-bad" : "text-ok";
  const icon = !done ? null : failed ? <AlertIcon size={13} /> : <CheckIcon size={13} />;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${tone}`}
      title={failed ? s.failed.map((f) => `${f.path}: ${f.message}`).join("\n") : undefined}
    >
      {icon}
      <span>{summary}</span>
      <output className="sr-only">{done ? summary : ""}</output>
    </span>
  );
}

function ManifestViewer({ manifest }: { manifest: Manifest }) {
  const json = useMemo(() => JSON.stringify(manifest, null, 2), [manifest]);
  const bytes = useMemo(() => new TextEncoder().encode(json).length, [json]);
  return (
    <details className="group mt-3 rounded-md border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[13px] text-text [&::-webkit-details-marker]:hidden">
        <span className="font-mono">manifest.json</span>
        <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
          {bytes.toLocaleString("en-US")} B
          <span aria-hidden="true" className="transition-transform duration-150 group-open:rotate-90">
            ›
          </span>
        </span>
      </summary>
      <p className="border-t border-line px-3 py-2 text-[12px] text-muted">
        The whole video is a pure function of this object: same manifest, same frames.
      </p>
      <pre tabIndex={0} className="max-h-72 overflow-auto border-t border-line px-3 py-2 text-[11.5px] leading-relaxed text-muted">
        {json}
      </pre>
    </details>
  );
}

/** "Program monitor": the elevated surface of the page. Remounts the Player only when the frame size changes. */
export function PlayerCard({ manifest, ref }: { manifest: Manifest; ref?: Ref<HTMLElement> }) {
  const { width, height } = FORMATS[manifest.format];
  const frames = totalFrames(manifest);

  return (
    <section
      ref={ref}
      aria-label="Program monitor"
      data-testid="program-monitor"
      className="rounded-lg border border-line-strong bg-surface-2 p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <span className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
          Program
        </span>
        <CacheIndicator />
      </div>
      <div
        style={{ "--ratio": width / height }}
        className="mx-auto w-full max-w-[min(100%,380px,calc((100svh_-_180px)_*_var(--ratio)))] overflow-hidden rounded-md bg-black lg:max-w-[min(100%,calc((100svh_-_260px)_*_var(--ratio)))]"
      >
        <AdPlayer key={manifest.format} manifest={manifest} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <output aria-live="polite" data-testid="variant-id" className="font-mono text-[15px] font-semibold text-accent">
          {manifest.variantId}
        </output>
        <span className="font-mono text-[12px] text-muted">
          {(frames / FPS).toFixed(2)} s · {frames} f · {width}×{height}
        </span>
      </div>
      <ManifestViewer manifest={manifest} />
    </section>
  );
}

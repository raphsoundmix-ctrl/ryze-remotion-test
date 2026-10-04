"use client";

import { useState, type MouseEvent } from "react";
import type { Preview } from "./data";
import { ChevronRightIcon, PlayIcon } from "./icons";
import { openVariant, variantHref } from "./open-variant";

export function OpenInPlayer({ id }: { id: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    openVariant(id);
  };
  return (
    <a
      href={variantHref(id)}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-1 text-[12px] text-muted transition-colors duration-150 hover:text-accent"
    >
      Open in Player
      <ChevronRightIcon size={12} />
    </a>
  );
}

/** Rendered MP4: poster first (lazy), the video element only mounts on click. */
export function PreviewCard({ preview, meta, openable }: { preview: Preview; meta: string | null; openable: boolean }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="flex min-w-0 flex-col">
      <div className="relative aspect-[9/16] overflow-hidden rounded-md border border-line bg-black">
        {playing ? (
          <video src={preview.video} controls autoPlay playsInline className="size-full object-cover" />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={`Play rendered ${preview.variantId}`} className="group absolute inset-0">
            {preview.poster ? (
              <img
                src={preview.poster}
                alt=""
                width={540}
                height={960}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
              />
            ) : (
              <span className="flex size-full items-center justify-center px-2 text-center font-mono text-[11px] text-muted">no poster</span>
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-black/70 text-text ring-1 ring-white/20 transition-colors duration-150 group-hover:bg-accent group-hover:text-on-accent">
                <PlayIcon size={14} />
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[11.5px] text-text">{preview.variantId}</span>
        {meta ? <span className="shrink-0 font-mono text-[11px] text-muted">{meta}</span> : null}
      </figcaption>
      {openable ? <OpenInPlayer id={preview.variantId} /> : null}
    </figure>
  );
}

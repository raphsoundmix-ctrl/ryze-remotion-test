"use client";

import { useRef, useState, type SyntheticEvent } from "react";
import { PauseIcon, PlayIcon } from "./icons";
import { useMediaSrc } from "./PackMedia";

const THUMB_SEC = 0.5;
const CLAMP_CHARS = 110;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** play() rejects with AbortError when a pause or src swap interrupts it; that is expected, anything else is a failure. */
function startPlayback(el: HTMLMediaElement, onFail: () => void) {
  el.play().catch((e: unknown) => {
    if (e instanceof DOMException && e.name === "AbortError") return;
    onFail();
  });
}

/** Park on a representative frame; the first frame of generated clips is often a fade from black. */
function seekToThumb(v: HTMLVideoElement) {
  if (Number.isFinite(v.duration)) v.currentTime = Math.min(THUMB_SEC, v.duration / 3);
}

/** Muted clip thumbnail: hover plays (unless reduced motion), click/Enter toggles. */
export function ClipThumb({ path, name }: { path: string; name: string }) {
  const src = useMediaSrc(path);
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const play = () => {
    if (ref.current) startPlayback(ref.current, () => setFailed(true));
  };
  const stop = () => {
    const v = ref.current;
    if (!v) return;
    v.pause();
    seekToThumb(v);
  };
  const onMetadata = (e: SyntheticEvent<HTMLVideoElement>) => seekToThumb(e.currentTarget);

  return (
    <button
      type="button"
      aria-label={`${playing ? "Pause" : "Play"} ${name}`}
      onClick={() => (playing ? stop() : play())}
      onMouseEnter={() => !prefersReducedMotion() && play()}
      onMouseLeave={stop}
      className="group relative block aspect-[9/16] w-full overflow-hidden rounded-sm border border-line bg-black"
    >
      <video
        ref={ref}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={onMetadata}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
      <span className="absolute bottom-1 left-1 flex size-6 items-center justify-center rounded-full bg-black/70 text-text opacity-90 transition-opacity duration-150 group-hover:opacity-100">
        {playing ? <PauseIcon size={10} /> : <PlayIcon size={10} />}
      </span>
      {failed ? <span className="absolute inset-x-0 top-0 bg-bad/90 px-1 py-0.5 text-[10px] text-on-accent">playback failed</span> : null}
    </button>
  );
}

/** Brand stills (transparent packshot) on a neutral studio tile. */
export function ImageThumb({ path, name }: { path: string; name: string }) {
  const src = useMediaSrc(path);
  return (
    <span className="flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-sm border border-line bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklab,var(--text)_34%,var(--surface-2)),var(--surface-2)_75%)]">
      <img src={src} alt={name} width={160} height={284} loading="lazy" className="max-h-[85%] w-auto object-contain" />
    </span>
  );
}

export function AudioButton({ path, name }: { path: string; name: string }) {
  const src = useMediaSrc(path);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) startPlayback(a, () => setFailed(true));
    else a.pause();
  };
  const tone = failed
    ? "border-bad text-bad"
    : playing
      ? "border-accent bg-accent text-on-accent"
      : "border-line-strong bg-surface-2 text-text hover:border-accent/60";

  return (
    <>
      <button
        type="button"
        aria-label={failed ? `${name} failed to play` : `${playing ? "Pause" : "Play"} ${name}`}
        onClick={toggle}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${tone}`}
      >
        {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </button>
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
    </>
  );
}

/** Long prompt text clamped to two lines with an explicit expand control. */
export function ClampText({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > CLAMP_CHARS;
  return (
    <div>
      <p className={`text-[12px] leading-relaxed text-muted ${long && !open ? "line-clamp-2" : ""}`}>{text}</p>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="-my-2 inline-flex min-h-11 items-center text-[12px] text-text underline decoration-line-strong underline-offset-4 hover:decoration-accent"
        >
          {open ? "Show less" : `Show full ${label}`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Pure timing math shared by the template, the Player, the batch renderer and verify.
 * No node APIs: safe to import from src/remotion/** and the browser.
 */
import { CTA_HOLD_SEC, DUCK_RAMP_FRAMES, FPS, MUSIC_DUCKED_VOLUME, TRANSITION_FRAMES } from "../constants";
import type { Manifest, Scene } from "../contract";

export const msToFrame = (ms: number) => (ms / 1000) * FPS;
export const CTA_HOLD_FRAMES = Math.round(CTA_HOLD_SEC * FPS);

export const sceneFrames = (s: Pick<Scene, "durationSec">) => Math.max(1, Math.ceil(s.durationSec * FPS));

/** Frames each TransitionSeries.Sequence occupies (the CTA also carries the end-card hold). */
export const sequenceFrames = (m: Pick<Manifest, "scenes">) =>
  m.scenes.map((s, i) => sceneFrames(s) + (i === m.scenes.length - 1 ? CTA_HOLD_FRAMES : 0));

/** Global start frame of every scene: transitions overlap neighbouring scenes by TRANSITION_FRAMES. */
export const sceneStarts = (m: Pick<Manifest, "scenes">) => {
  const lens = sequenceFrames(m);
  const starts: number[] = [];
  let at = 0;
  lens.forEach((len, i) => {
    starts.push(at);
    at += len - (i < lens.length - 1 ? TRANSITION_FRAMES : 0);
  });
  return starts;
};

/** Composition length: sum of scenes + CTA hold - transition overlaps. */
export const totalFrames = (m: Pick<Manifest, "scenes">) => {
  const lens = sequenceFrames(m);
  return lens.reduce((a, b) => a + b, 0) - TRANSITION_FRAMES * Math.max(0, lens.length - 1);
};

/** Every spoken word as a global [startFrame, endFrame) window, tagged with its scene. */
export const voiceWindows = (m: Pick<Manifest, "scenes">) => {
  const starts = sceneStarts(m);
  return m.scenes.flatMap((s, i) =>
    s.words.map((w) => ({ scene: s.id, start: starts[i] + msToFrame(w.startMs), end: starts[i] + msToFrame(w.endMs) })),
  );
};

/** Body with 2+ clips: cut at the word boundary nearest the middle of the speech (ms, scene-local). */
export const bodyCutMs = (s: Pick<Scene, "words" | "durationSec">) => {
  const mid = (s.durationSec * 1000) / 2;
  const gaps = s.words.slice(0, -1).map((w, i) => (w.endMs + s.words[i + 1].startMs) / 2);
  if (gaps.length === 0) return mid;
  return gaps.reduce((best, g) => (Math.abs(g - mid) < Math.abs(best - mid) ? g : best), gaps[0]);
};

/** Music volume at a global frame: ducked while any word is spoken (ramped), faded out over the last second. */
export const musicVolume = (
  frame: number,
  windows: { start: number; end: number }[],
  total: number,
  base: number,
) => {
  let duck = 0; // 0 = full bed, 1 = fully ducked
  for (const w of windows) {
    if (frame >= w.start - DUCK_RAMP_FRAMES && frame <= w.end + DUCK_RAMP_FRAMES) {
      const d =
        frame < w.start ? 1 - (w.start - frame) / DUCK_RAMP_FRAMES
        : frame > w.end ? 1 - (frame - w.end) / DUCK_RAMP_FRAMES
        : 1;
      duck = Math.max(duck, d);
    }
  }
  const ducked = Math.min(base, MUSIC_DUCKED_VOLUME);
  const v = base - (base - ducked) * duck;
  const fadeOut = Math.max(0, Math.min(1, (total - frame) / FPS));
  return v * fadeOut;
};

import React, { useMemo } from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { HOOK_OVERLAY_SEC, TRANSITION_FRAMES } from "../constants";
import type { Manifest, Scene } from "../contract";
import { bodyCutMs, msToFrame, musicVolume, sceneStarts, sequenceFrames, totalFrames, voiceWindows } from "../lib/timing";
import { Captions } from "./components/Captions";
import { Clip } from "./components/Clip";
import { EndCard, HookOverlay, SyntheticBadge } from "./components/Overlays";
import "./theme";

const PUNCH_IN_FRAMES = 6;
const SFX_VOLUME = 0.35;

/** Visual track of one scene: one clip, or two clips cut at a word boundary (body). */
const SceneVisual: React.FC<{ scene: Scene; frames: number }> = ({ scene, frames }) => {
  if (scene.videoSrcs.length < 2) return <Clip src={scene.videoSrcs[0]} clipSec={scene.clipSec} frames={frames} />;
  const cut = Math.round(msToFrame(bodyCutMs(scene)));
  return (
    <>
      <Sequence durationInFrames={cut}>
        <Clip src={scene.videoSrcs[0]} clipSec={scene.clipSec} frames={cut} />
      </Sequence>
      <Sequence from={cut}>
        <Clip src={scene.videoSrcs[1]} clipSec={scene.clipSec} frames={frames - cut} punchIn={PUNCH_IN_FRAMES} seed={1} />
      </Sequence>
    </>
  );
};

const SceneView: React.FC<{ scene: Scene; m: Manifest; frames: number }> = ({ scene, m, frames }) => {
  const { fps } = useVideoConfig();
  const isCta = scene.slot === "cta";
  const hero = isCta && scene.videoSrcs[0] === m.brand.packshotSrc;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {hero ? null : <SceneVisual scene={scene} frames={frames} />}
      {isCta ? null : (
        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 60%)" }} />
      )}
      <Html5Audio src={staticFile(scene.audioSrc)} />
      {isCta ? (
        <EndCard brand={m.brand.name} packshotSrc={m.brand.packshotSrc} hero={hero} words={scene.words} text={scene.text} style={m.style} format={m.format} />
      ) : (
        <Captions words={scene.words} style={m.style} format={m.format} />
      )}
      {scene.slot === "hook" && scene.onScreen ? (
        <Sequence durationInFrames={Math.min(HOOK_OVERLAY_SEC * fps, frames - TRANSITION_FRAMES)} layout="none">
          <HookOverlay text={scene.onScreen} style={m.style} format={m.format} frames={Math.min(HOOK_OVERLAY_SEC * fps, frames - TRANSITION_FRAMES)} />
        </Sequence>
      ) : null}
      {hero && m.sfx?.pop ? (
        <Sequence from={4} layout="none">
          <Html5Audio src={staticFile(m.sfx.pop)} volume={SFX_VOLUME} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * One template, any manifest: hook -> body -> cta with transitions, word-synced captions,
 * on-screen hook, end card, ducked music bed. Duration = f(manifest) via lib/timing.ts.
 */
export const AdVariant: React.FC<Manifest> = (m) => {
  const lens = sequenceFrames(m);
  const starts = sceneStarts(m);
  const total = totalFrames(m);
  const windows = useMemo(() => voiceWindows(m), [m]);
  const timing = linearTiming({ durationInFrames: TRANSITION_FRAMES });
  const presentations = [slide({ direction: "from-right" }), fade()];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {m.scenes.flatMap((scene, i) => {
          const seq = (
            <TransitionSeries.Sequence key={`s-${scene.id}`} durationInFrames={lens[i]}>
              <SceneView scene={scene} m={m} frames={lens[i]} />
            </TransitionSeries.Sequence>
          );
          return i < m.scenes.length - 1
            ? [seq, <TransitionSeries.Transition key={`t-${i}`} presentation={presentations[i]} timing={timing} />]
            : [seq];
        })}
      </TransitionSeries>
      {m.music ? (
        <Html5Audio src={staticFile(m.music.src)} volume={(f) => musicVolume(f, windows, total, m.music?.volume ?? 0)} />
      ) : null}
      {m.sfx?.transition
        ? starts.slice(1).map((s, i) => (
            <Sequence key={`sfx-${i}`} from={Math.max(0, s - 2)} durationInFrames={30} layout="none">
              <Html5Audio src={staticFile(m.sfx?.transition ?? "")} volume={SFX_VOLUME} />
            </Sequence>
          ))
        : null}
      {m.pack.provenance === "synthetic" ? <SyntheticBadge /> : null}
    </AbsoluteFill>
  );
};

import React from "react";
import {
  AbsoluteFill, Html5Audio, Loop, OffthreadVideo, Sequence, Series,
  interpolate, useCurrentFrame,
} from "remotion";
import { FPS, HOOK_SECONDS, type Manifest, type Scene } from "../schema";
import { sceneFrames } from "../lib/timing";
import { Captions } from "./components/Captions";
import { Cta, Hook } from "./components/Overlays";

const CLIP_FRAMES = 5 * FPS; // fal B-roll clips are 5s -> loop when the scene is longer

const Background: React.FC<{ scene: Scene; index: number; look: Manifest["look"]; frames: number }> = ({ scene, index, look, frames }) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, frames], [1, 1.08]); // slow push-in on every cut
  if (scene.videoSrc) {
    return (
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Loop durationInFrames={CLIP_FRAMES}>
          <OffthreadVideo src={scene.videoSrc} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Loop>
      </AbsoluteFill>
    );
  }
  // Placeholder (mock mode / no asset): animated gradient so the preview is never empty
  const drift = interpolate(frame, [0, frames], [20, 80]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${drift}% ${100 - drift}%, ${look.bgTo}, ${look.bgFrom} 70%)`,
        transform: `scale(${zoom}) rotate(${index * 2}deg)`,
      }}
    />
  );
};

const SceneView: React.FC<{ scene: Scene; index: number; m: Manifest; isLast: boolean }> = ({ scene, index, m, isLast }) => {
  const frames = sceneFrames(scene);
  return (
    <AbsoluteFill>
      <Background scene={scene} index={index} look={m.look} frames={frames} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0) 55%)" }} />
      {scene.audioSrc ? <Html5Audio src={scene.audioSrc} /> : null}
      <Captions words={scene.words} style={m.captionStyle} accent={m.look.accent} />
      {index === 0 ? (
        <Sequence durationInFrames={HOOK_SECONDS * FPS} layout="none">
          <Hook text={m.hook} accent={m.look.accent} frames={HOOK_SECONDS * FPS} />
        </Sequence>
      ) : null}
      {isLast ? (
        <Sequence from={Math.max(0, frames - 2 * FPS)} layout="none">
          <Cta text={m.cta} accent={m.look.accent} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

/** One template, any manifest. Duration = sum of scene voiceover lengths (see lib/timing.ts). */
export const AIVideoTemplate: React.FC<Manifest> = (m) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Series>
      {m.scenes.map((scene, i) => (
        <Series.Sequence key={scene.id} durationInFrames={sceneFrames(scene)}>
          <SceneView scene={scene} index={i} m={m} isLast={i === m.scenes.length - 1} />
        </Series.Sequence>
      ))}
    </Series>
    {m.musicSrc ? <Html5Audio src={m.musicSrc} volume={0.12} /> : null}
  </AbsoluteFill>
);

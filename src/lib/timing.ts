import { FPS, type Manifest, type Scene } from "../schema";

export const sceneFrames = (s: Pick<Scene, "durationSec">) =>
  Math.max(1, Math.ceil(s.durationSec * FPS));

/** Single source of truth for composition length: Player AND calculateMetadata use this. */
export const totalFrames = (m: Pick<Manifest, "scenes">) =>
  m.scenes.reduce((acc, s) => acc + sceneFrames(s), 0);

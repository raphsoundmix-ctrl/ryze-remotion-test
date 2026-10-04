import React from "react";
import { AbsoluteFill, Img, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FPS } from "../../constants";
import { isImage } from "../theme";

/**
 * One visual source filling the frame. Video loops (OffthreadVideo has no `loop`), images get Ken Burns.
 * `punchIn` = frames of a quick zoom-settle at the start (used at the body cut).
 */
export const Clip: React.FC<{ src: string; clipSec?: number | null; frames: number; punchIn?: number; seed?: number }> = ({
  src, clipSec, frames, punchIn = 0, seed = 0,
}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, frames], [1.0, 1.06], { extrapolateRight: "clamp" });
  const punch = punchIn > 0 ? interpolate(frame, [0, punchIn], [1.1, 1], { extrapolateRight: "clamp" }) : 1;
  const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

  if (isImage(src)) {
    const pan = interpolate(frame, [0, frames], seed % 2 ? [-2, 2] : [2, -2]);
    return (
      <AbsoluteFill style={{ transform: `scale(${drift * 1.08 * punch}) translateX(${pan}%)` }}>
        <Img src={staticFile(src)} style={style} />
      </AbsoluteFill>
    );
  }
  const loopFrames = Math.max(1, Math.floor((clipSec ?? 5) * FPS));
  return (
    <AbsoluteFill style={{ transform: `scale(${drift * punch})` }}>
      <Loop durationInFrames={loopFrames}>
        <OffthreadVideo src={staticFile(src)} muted style={style} />
      </Loop>
    </AbsoluteFill>
  );
};

import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/** 0-3s hook: springs in, fades out in its last 6 frames. Mount inside a <Sequence>. */
export const Hook: React.FC<{ text: string; accent: string; frames: number }> = ({ text, accent, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const fade = interpolate(frame, [frames - 6, frames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 230, opacity: fade }}>
      <div
        style={{
          transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])}) rotate(${interpolate(pop, [0, 1], [-4, -2])}deg)`,
          background: accent,
          color: "#0D1B33",
          fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 900,
          fontSize: 84,
          lineHeight: 1.05,
          textTransform: "uppercase",
          textAlign: "center",
          padding: "26px 40px",
          borderRadius: 24,
          maxWidth: 900,
          boxShadow: "0 18px 0 rgba(0,0,0,0.35)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Closing CTA pill for the last scene. */
export const Cta: React.FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 150 }}>
      <div
        style={{
          transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`,
          border: `6px solid ${accent}`,
          color: accent,
          background: "rgba(0,0,0,0.55)",
          fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 800,
          fontSize: 56,
          padding: "20px 48px",
          borderRadius: 999,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

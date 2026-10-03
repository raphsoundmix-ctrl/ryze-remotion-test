import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionStyle, Word } from "../../schema";

const CHUNK = 3; // words on screen at once

function chunkWords(words: Word[]): Word[][] {
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += CHUNK) out.push(words.slice(i, i + CHUNK));
  return out;
}

/** Word-synced captions. `hormozi` = bold caps + active-word pop; `clean` = sentence-case pill. */
export const Captions: React.FC<{ words: Word[]; style: CaptionStyle; accent: string }> = ({ words, style, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chunks = useMemo(() => chunkWords(words), [words]);
  const tMs = (frame / fps) * 1000;

  let idx = -1;
  for (let i = 0; i < chunks.length; i++) if (chunks[i][0].startMs <= tMs) idx = i;
  if (idx < 0) return null;

  const chunk = chunks[idx];
  const end = chunks[idx + 1]?.[0].startMs ?? chunk[chunk.length - 1].endMs + 250;
  if (tMs >= end) return null;

  const hormozi = style === "hormozi";
  const activeIdx = chunk.reduce((a, w, i) => (w.startMs <= tMs ? i : a), 0);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 380 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: hormozi ? "10px 26px" : "8px 18px",
          maxWidth: 940,
          padding: hormozi ? 0 : "18px 30px",
          borderRadius: 28,
          background: hormozi ? "transparent" : "rgba(0,0,0,0.5)",
        }}
      >
        {chunk.map((w, i) => {
          const active = i === activeIdx;
          const startFrame = Math.round((w.startMs / 1000) * fps);
          const pop = spring({ frame: frame - startFrame, fps, config: { damping: 12, stiffness: 220 }, durationInFrames: 10 });
          const scale = active ? interpolate(pop, [0, 1], [0.85, 1.12]) : 1;
          return (
            <span
              key={`${w.startMs}-${i}`}
              style={{
                display: "inline-block",
                transform: `scale(${scale})`,
                fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
                fontSize: hormozi ? 92 : 62,
                fontWeight: hormozi ? 900 : 700,
                textTransform: hormozi ? "uppercase" : "none",
                letterSpacing: hormozi ? 1 : 0,
                color: active ? accent : "#fff",
                opacity: !hormozi && !active ? 0.75 : 1,
                WebkitTextStroke: hormozi ? "8px #000" : undefined,
                paintOrder: "stroke fill",
                textShadow: hormozi ? "0 6px 0 rgba(0,0,0,0.6)" : undefined,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

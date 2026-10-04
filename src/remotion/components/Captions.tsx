import React, { useMemo } from "react";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Format, Style, Word } from "../../contract";
import { FONT_STACK, LAYOUT, STYLE_TOKENS } from "../theme";

const COMBINE_MS = 650; // pages are grouped by time; tuned so pages hold 2-4 words at conversational pace
const ACTIVE_SCALE = 1.08; // keep small: scale growth + stroke must stay inside the word margin

export const toCaptions = (words: Word[]): Caption[] =>
  words.map((w, i) => ({
    text: i === 0 ? w.word : ` ${w.word}`, // leading space = word boundary for createTikTokStyleCaptions
    startMs: w.startMs,
    endMs: w.endMs,
    timestampMs: (w.startMs + w.endMs) / 2,
    confidence: 1,
  }));

/** Word-synced captions for one scene (scene-local time). */
export const Captions: React.FC<{ words: Word[]; style: Style; format: Format }> = ({ words, style, format }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const pages = useMemo(
    () => createTikTokStyleCaptions({ captions: toCaptions(words), combineTokensWithinMilliseconds: COMBINE_MS }).pages,
    [words],
  );
  const t = (frame / fps) * 1000;
  const page = pages.find((p, i) => t >= p.startMs && t < (pages[i + 1]?.startMs ?? p.startMs + p.durationMs + 300));
  if (!page) return null;

  const L = LAYOUT[format];
  const tok = STYLE_TOKENS[style];
  const hormozi = style === "hormozi";
  const size = (hormozi ? 86 : 60) * L.type * (width / 1080);
  const enter = spring({ frame: frame - Math.round((page.startMs / 1000) * fps), fps, config: { damping: 14, stiffness: 240 }, durationInFrames: 8 });

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: height * L.captionCenterY,
          transform: `translateY(-50%) scale(${interpolate(enter, [0, 1], [0.92, 1])})`,
          width: width * L.contentWidth,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            textAlign: "center",
            lineHeight: hormozi ? 1.12 : 1.25,
            padding: hormozi ? 0 : `${size * 0.32}px ${size * 0.55}px`,
            borderRadius: size * 0.5,
            background: hormozi ? "transparent" : "rgba(10,12,16,0.72)",
          }}
        >
          {page.tokens.map((tk, i) => {
            const active = t >= tk.fromMs && t < (page.tokens[i + 1]?.fromMs ?? tk.toMs + 120); // exactly one active word
            const pop = spring({ frame: frame - Math.round((tk.fromMs / 1000) * fps), fps, config: { damping: 12, stiffness: 260 }, durationInFrames: 6 });
            return (
              <span
                key={`${tk.fromMs}-${i}`}
                style={{
                  display: "inline-block",
                  marginInline: "0.16em", // two neighbours => 0.32em gap: exceeds scale growth + stroke
                  transform: `scale(${active ? interpolate(pop, [0, 1], [1, ACTIVE_SCALE]) : 1})`,
                  fontFamily: FONT_STACK,
                  fontSize: size,
                  fontWeight: hormozi ? 900 : 800,
                  textTransform: hormozi ? "uppercase" : "none",
                  letterSpacing: hormozi ? "0.01em" : "-0.01em",
                  color: active ? tok.accent : tok.ink,
                  opacity: !hormozi && !active && t < tk.fromMs ? 0.55 : 1,
                  WebkitTextStroke: hormozi ? `${6 * (width / 1080)}px #000` : undefined,
                  paintOrder: "stroke fill",
                  textShadow: hormozi ? `0 ${5 * (width / 1080)}px 0 rgba(0,0,0,0.55)` : undefined,
                }}
              >
                {tk.text.trim()}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

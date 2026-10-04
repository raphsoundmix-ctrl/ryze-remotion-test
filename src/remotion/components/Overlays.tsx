import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Format, Style, Word } from "../../contract";
import { FONT_STACK, LAYOUT, STYLE_TOKENS } from "../theme";

/** On-screen hook text for the first seconds. Springs in, fades out over its last 6 frames. */
export const HookOverlay: React.FC<{ text: string; style: Style; format: Format; frames: number }> = ({ text, style, format, frames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const L = LAYOUT[format];
  const tok = STYLE_TOKENS[style];
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 170 } });
  const fade = interpolate(frame, [frames - 6, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hormozi = style === "hormozi";
  const size = (hormozi ? 78 : 64) * L.type * (width / 1080);
  return (
    <AbsoluteFill style={{ alignItems: "center", opacity: fade }}>
      <div
        style={{
          position: "absolute",
          top: height * L.hookTopY,
          maxWidth: width * L.contentWidth,
          transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])}) rotate(${hormozi ? interpolate(pop, [0, 1], [-5, -2]) : 0}deg)`,
          background: tok.hookBg,
          color: tok.hookInk,
          fontFamily: FONT_STACK,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.04,
          letterSpacing: hormozi ? "-0.01em" : "-0.02em",
          textTransform: "uppercase",
          textAlign: "center",
          padding: `${size * 0.3}px ${size * 0.5}px`,
          borderRadius: size * 0.28,
          boxShadow: hormozi ? `0 ${size * 0.18}px 0 rgba(0,0,0,0.35)` : "0 20px 60px rgba(0,0,0,0.35)",
          backdropFilter: hormozi ? undefined : "blur(8px)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Final call-to-action: last sentence of the CTA line, e.g. "Link in bio." -> "LINK IN BIO". */
export const ctaPill = (text: string) => {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (sentences[sentences.length - 1] ?? text).replace(/[.!?]+$/, "").toUpperCase();
};

/**
 * End card for the CTA slot. With `hero` the packshot springs in on a studio backdrop;
 * without it (a CTA video clip exists) only brand + CTA text are drawn over the clip.
 * The CTA line is spoken, so its words light up in sync with the VO (no separate captions).
 */
export const EndCard: React.FC<{
  brand: string; packshotSrc: string; hero: boolean; words: Word[]; text: string; style: Style; format: Format;
}> = ({ brand, packshotSrc, hero, words, text, style, format }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tok = STYLE_TOKENS[style];
  const L = LAYOUT[format];
  const k = width / 1080;
  const t = (frame / fps) * 1000;
  const land = spring({ frame: frame - 2, fps, config: { damping: 13, stiffness: 120, mass: 0.9 } });
  const textIn = spring({ frame: frame - 8, fps, config: { damping: 16, stiffness: 140 } });
  const pillIn = spring({ frame: frame - 14, fps, config: { damping: 11, stiffness: 180 } });
  const pulse = 1 + 0.025 * Math.sin((frame / fps) * Math.PI * 2.2) * pillIn;
  const heroH = height * (format === "9x16" ? 0.44 : 0.46);
  const textTop = hero ? height * (format === "9x16" ? 0.56 : 0.6) : height * 0.42;

  return (
    <AbsoluteFill>
      {hero ? (
        <>
          <AbsoluteFill style={{ background: "radial-gradient(120% 70% at 50% 34%, #2a2f37 0%, #121418 46%, #050506 100%)" }} />
          <AbsoluteFill style={{ background: "radial-gradient(40% 6% at 50% 53%, rgba(0,0,0,0.6), rgba(0,0,0,0) 100%)", opacity: land }} />
          <AbsoluteFill style={{ alignItems: "center" }}>
            <Img
              src={staticFile(packshotSrc)}
              style={{
                position: "absolute",
                top: height * (format === "9x16" ? 0.085 : 0.05),
                height: heroH,
                objectFit: "contain",
                transform: `translateY(${interpolate(land, [0, 1], [height * 0.06, 0])}px) scale(${interpolate(land, [0, 1], [0.78, 1])}) rotate(${interpolate(land, [0, 1], [-6, 0])}deg)`,
                opacity: interpolate(land, [0, 0.25], [0, 1], { extrapolateRight: "clamp" }),
                filter: "drop-shadow(0 40px 50px rgba(0,0,0,0.55))",
              }}
            />
          </AbsoluteFill>
        </>
      ) : (
        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.25) 70%)" }} />
      )}
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ position: "absolute", top: textTop, width: width * L.contentWidth, textAlign: "center", opacity: textIn, transform: `translateY(${interpolate(textIn, [0, 1], [24 * k, 0])}px)` }}>
          <div style={{ fontFamily: FONT_STACK, fontWeight: 900, fontSize: 46 * k * L.type, letterSpacing: "0.42em", color: "#E9EDF2", marginBottom: 22 * k }}>
            {brand.toUpperCase()}
          </div>
          <div style={{ fontFamily: FONT_STACK, fontWeight: 800, fontSize: 70 * k * L.type, lineHeight: 1.12, letterSpacing: "-0.02em" }}>
            {words.map((w, i) => {
              const active = t >= w.startMs && t < (words[i + 1]?.startMs ?? w.endMs + 200);
              const spoken = t >= w.startMs;
              return (
                <span key={`${w.startMs}-${i}`} style={{ display: "inline-block", marginInline: "0.14em", color: active ? tok.accent : spoken ? "#FFFFFF" : "rgba(255,255,255,0.38)" }}>
                  {w.word}
                </span>
              );
            })}
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: 40 * k * L.type,
              padding: `${22 * k * L.type}px ${56 * k * L.type}px`,
              borderRadius: 999,
              background: tok.accent,
              color: "#0B0B0C",
              fontFamily: FONT_STACK,
              fontWeight: 900,
              fontSize: 44 * k * L.type,
              letterSpacing: "0.04em",
              transform: `scale(${interpolate(pillIn, [0, 1], [0.6, 1]) * pulse})`,
              opacity: interpolate(pillIn, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
              boxShadow: `0 ${14 * k}px ${40 * k}px rgba(0,0,0,0.45)`,
            }}
          >
            {ctaPill(text)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Honesty label: shown on every frame when the pack is synthetic (procedural placeholder media). */
export const SyntheticBadge: React.FC = () => {
  const { width } = useVideoConfig();
  const k = width / 1080;
  return (
    <AbsoluteFill style={{ alignItems: "flex-end" }}>
      <div
        style={{
          margin: 28 * k,
          padding: `${8 * k}px ${16 * k}px`,
          borderRadius: 999,
          background: "rgba(0,0,0,0.55)",
          border: `${2 * k}px solid rgba(255,255,255,0.35)`,
          color: "rgba(255,255,255,0.85)",
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: 22 * k,
          letterSpacing: "0.12em",
        }}
      >
        SYNTHETIC ASSETS · DEMO
      </div>
    </AbsoluteFill>
  );
};

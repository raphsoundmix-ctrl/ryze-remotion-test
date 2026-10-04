import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import type { Format, Style } from "../contract";

export const FONT = "Inter";
export const FONT_STACK = `${FONT}, 'Helvetica Neue', Arial, sans-serif`;

// Offline fonts (OFL, committed in public/fonts): no network at render. Guarded for SSR/verify (no document there).
if (typeof document !== "undefined") {
  for (const weight of ["600", "800", "900"]) {
    loadFont({ family: FONT, url: staticFile(`fonts/inter-${weight}.woff2`), weight, display: "block" });
  }
}

/** Per-style look. `hormozi` = bold caps + yellow active word; `clean` = sentence-case pill + ice accent. */
export const STYLE_TOKENS: Record<Style, { accent: string; ink: string; hookBg: string; hookInk: string }> = {
  hormozi: { accent: "#FFE135", ink: "#FFFFFF", hookBg: "#FFE135", hookInk: "#0B0B0C" },
  clean: { accent: "#7FE3FF", ink: "#FFFFFF", hookBg: "rgba(10,12,16,0.78)", hookInk: "#FFFFFF" },
};

/**
 * Safe zones per format, as fractions of the frame. Platform UI (username, buttons, progress bar)
 * covers the bottom ~20% and the right edge of 9:16, so captions live in y 55-68% of the central 80%.
 */
export const LAYOUT: Record<Format, { captionCenterY: number; hookTopY: number; contentWidth: number; type: number }> = {
  "9x16": { captionCenterY: 0.615, hookTopY: 0.15, contentWidth: 0.8, type: 1 },
  "4x5": { captionCenterY: 0.66, hookTopY: 0.1, contentWidth: 0.84, type: 0.92 },
  "1x1": { captionCenterY: 0.7, hookTopY: 0.08, contentWidth: 0.86, type: 0.8 },
};

export const isImage = (src: string) => /\.(png|jpe?g|webp)$/i.test(src);

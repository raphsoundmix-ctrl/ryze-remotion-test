/** Shared raster types + tiny math helpers for the procedural visuals. Pure. */

export type Rgba = { width: number; height: number; data: Uint8Array };
export type Rgb = [number, number, number];

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const toByte = (linear: number) => Math.round(255 * Math.pow(clamp01(linear), 1 / 2.2));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const gauss = (x: number, mu: number, sigma: number) => Math.exp(-(((x - mu) / sigma) ** 2));

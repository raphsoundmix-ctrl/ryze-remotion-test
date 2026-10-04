/**
 * Procedural packshot: anti-aliased RGBA matte-black insulated bottle with a brushed-steel cap,
 * soft top light, cylindrical shading, rim light and an optional soft contact shadow. Pure.
 */
import { clamp01, gauss, smooth, toByte, type Rgb, type Rgba } from "./raster";
import { rngFor } from "./rng";

type Part = "cap" | "band" | "neck" | "shoulder" | "body";
type Profile = { part: Part; hw: number; slope: number };

/** Geometry at scale 1 on a 1600×2400 canvas (bottle ≈ 2100 px tall). */
const GEO = {
  W: 1600, H: 2400, cx: 800,
  capTop: 150, capBottom: 440, capHw: 220, capR: 40,
  bandBottom: 472, bandHw: 206,
  neckBottom: 560, neckHw: 200,
  shoulderBottom: 830, bodyHw: 290,
  bodyBottom: 2250, bodyR: 70,
};

function profileAt(y: number, s: number): Profile | null {
  const g = GEO;
  const capTop = g.capTop * s;
  const capBottom = g.capBottom * s;
  if (y < capTop) return null;
  if (y < capBottom) {
    let hw = g.capHw * s;
    const r = g.capR * s;
    if (y < capTop + r) hw = hw - r + Math.sqrt(Math.max(0, r * r - (capTop + r - y) ** 2));
    const rb = 6 * s;
    if (y > capBottom - rb) hw = g.capHw * s - rb + Math.sqrt(Math.max(0, rb * rb - (y - (capBottom - rb)) ** 2));
    return { part: "cap", hw, slope: 0 };
  }
  if (y < g.bandBottom * s) return { part: "band", hw: g.bandHw * s, slope: 0 };
  if (y < g.neckBottom * s) return { part: "neck", hw: g.neckHw * s, slope: 0 };
  if (y < g.shoulderBottom * s) {
    const t = (y - g.neckBottom * s) / ((g.shoulderBottom - g.neckBottom) * s);
    const hw = (g.neckHw + (g.bodyHw - g.neckHw) * smooth(t)) * s;
    return { part: "shoulder", hw, slope: 6 * t * (1 - t) }; // d(smooth)/dt, 0..1.5
  }
  const bottom = g.bodyBottom * s;
  if (y < bottom) {
    const r = g.bodyR * s;
    let hw = g.bodyHw * s;
    if (y > bottom - r) hw = hw - r + Math.sqrt(Math.max(0, r * r - (y - (bottom - r)) ** 2));
    return { part: "body", hw, slope: 0 };
  }
  return null;
}

/** Linear-light RGB of the bottle surface at (x, y). */
function shade(p: Profile, x: number, y: number, s: number, rowNoise: number, pixNoise: number): Rgb {
  const nx = Math.max(-0.999, Math.min(0.999, (x - GEO.cx * s) / p.hw));
  const nz = Math.sqrt(1 - nx * nx);
  if (p.part === "cap" || p.part === "band") {
    let env = 0.16 + 0.55 * gauss(nx, -0.35, 0.28) + 0.32 * gauss(nx, 0.55, 0.1) + 0.12 * gauss(nx, -0.86, 0.06);
    const bevel = 14 * s;
    if (p.part === "cap" && y < GEO.capTop * s + bevel) env += 0.28 * (1 - (y - GEO.capTop * s) / bevel);
    if (p.part === "cap" && y > GEO.capBottom * s - 5 * s) env *= 0.75;
    const L = env * Math.pow(nz, 0.35) * (1 + 0.07 * rowNoise + 0.02 * pixNoise) * (p.part === "band" ? 0.5 : 1);
    return [L * 0.92, L * 0.95, L];
  }
  const bodyTop = GEO.shoulderBottom * s;
  const bodyLen = (GEO.bodyBottom - GEO.shoulderBottom) * s;
  const vert = p.part === "body" ? 1 - 0.32 * clamp01((y - bodyTop) / bodyLen) : p.part === "neck" ? 0.78 : 1.02;
  const diffuse = Math.max(0, -0.42 * nx + 0.8 * nz + 0.1);
  const sheen = 0.05 * gauss(nx, -0.42, 0.16) + 0.03 * gauss(nx, -0.42, 0.05);
  const rim = 0.05 * gauss(nx, 0.9, 0.06) + 0.03 * gauss(nx, -0.95, 0.04);
  const topLight = p.part === "shoulder" ? 0.07 * p.slope * nz * (0.6 + 0.4 * gauss(nx, -0.3, 0.5)) : 0;
  const albedo = 0.016;
  const L = albedo * (0.25 + 1.1 * diffuse) * vert + sheen * (0.6 + 0.4 * vert) + rim + topLight + 0.004 * pixNoise;
  return [L * 0.97, L * 0.99, L * 1.04];
}

/**
 * Render the bottle. scale 1 = 1600×2400 canvas. Straight (non-premultiplied) RGBA.
 * Coverage: 4 sub-rows per pixel × exact horizontal span overlap → anti-aliased edges.
 */
export function renderBottle(scale: number, opts: { shadow?: boolean; seed?: string } = {}): Rgba {
  const W = Math.round(GEO.W * scale);
  const H = Math.round(GEO.H * scale);
  const data = new Uint8Array(W * H * 4);
  const rnd = rngFor(opts.seed ?? "bottle");
  const rowNoise = new Float32Array(H);
  {
    // brushed streaks: smoothed per-row noise
    let v = 0;
    for (let y = 0; y < H; y++) {
      v = v * 0.55 + (rnd() * 2 - 1) * 0.45;
      rowNoise[y] = v;
    }
  }
  const cx = GEO.cx * scale;
  const cov = new Float32Array(W);
  const SUB = 4;
  const shadowCy = (GEO.bodyBottom + 12) * scale;
  const shadowRx = GEO.bodyHw * 1.25 * scale;
  const shadowRy = GEO.bodyHw * 0.14 * scale;
  for (let py = 0; py < H; py++) {
    cov.fill(0);
    let any = false;
    for (let k = 0; k < SUB; k++) {
      const pr = profileAt(py + (k + 0.5) / SUB, scale);
      if (!pr) continue;
      any = true;
      const l = cx - pr.hw;
      const r = cx + pr.hw;
      for (let x = Math.max(0, Math.floor(l)); x < Math.min(W, Math.ceil(r)); x++) {
        cov[x] += Math.max(0, Math.min(x + 1, r) - Math.max(x, l)) / SUB;
      }
    }
    let center = profileAt(py + 0.5, scale);
    if (!center && any) center = profileAt(py + 0.99, scale) ?? profileAt(py + 0.01, scale);
    for (let x = 0; x < W; x++) {
      const o = (py * W + x) * 4;
      let a = any ? cov[x] : 0;
      let rgb: Rgb = [0, 0, 0];
      if (a > 0 && center) rgb = shade(center, x + 0.5, py + 0.5, scale, rowNoise[py], rnd() * 2 - 1);
      if (opts.shadow) {
        const dx = (x + 0.5 - cx) / shadowRx;
        const dy = (py + 0.5 - shadowCy) / shadowRy;
        const sa = 0.42 * Math.exp(-(dx * dx + dy * dy) * 2.2);
        if (sa > 0.002) {
          const outA = a + sa * (1 - a);
          rgb = [(rgb[0] * a) / outA, (rgb[1] * a) / outA, (rgb[2] * a) / outA];
          a = outA;
        }
      }
      if (a <= 0) continue;
      data[o] = toByte(rgb[0]);
      data[o + 1] = toByte(rgb[1]);
      data[o + 2] = toByte(rgb[2]);
      data[o + 3] = Math.round(255 * clamp01(a));
    }
  }
  return { width: W, height: H, data };
}

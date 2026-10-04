/**
 * Procedural clips for the SYNTHETIC pack (pure math, no node imports):
 * ClipRenderer: 720×1280 frames (animated gradient, blobs, grain, bottle sprite, big slot id in a pixel font)
 *   emitted as top-down 24-bit BMP buffers for `ffmpeg -f image2pipe -c:v bmp` (the bundled ffmpeg has no rawvideo demuxer).
 */
import { textMask, type TextMask } from "./font";
import { clamp01, gauss, smooth, type Rgb, type Rgba } from "./raster";
import { rngFor } from "./rng";

/* ───────────────────────────── clips ───────────────────────────── */

export const CLIP_W = 720;
export const CLIP_H = 1280;
export const CLIP_FPS = 30;
export const CLIP_SEC = 5;

export type Motion = "sun" | "ice" | "handheld" | "pushin" | "stripes" | "bounce" | "slide";
export type ClipSpec = { id: string; role: string; colors: [string, string, string]; motion: Motion; bottle: boolean };

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const LW = 180; // low-res background grid (×4 upsampled)
const LH = 320;

/** Dark outline offsets [dx, dy, alpha] so white labels stay legible on bright backgrounds. */
const OUTLINE: [number, number, number][] = [[4, 4, 0.45], [-2, 0, 0.35], [2, 0, 0.35], [0, -2, 0.35], [0, 2, 0.35]];

type Particle = { x: number; y: number; size: number; speed: number; alpha: number; phase: number };

export class ClipRenderer {
  private readonly c0: Rgb;
  private readonly c1: Rgb;
  private readonly c2: Rgb;
  private readonly bg = new Float32Array(LW * LH * 3);
  private readonly grain = new Int8Array(256 * 256);
  private readonly idMask: TextMask;
  private readonly roleMask: TextMask;
  private readonly tagMask: TextMask;
  private readonly particles: Particle[] = [];
  private readonly rnd: () => number;
  private readonly xs0 = new Int32Array(CLIP_W);
  private readonly xw = new Float32Array(CLIP_W);

  constructor(private readonly spec: ClipSpec, private readonly sprite: Rgba | null) {
    this.c0 = hex(spec.colors[0]);
    this.c1 = hex(spec.colors[1]);
    this.c2 = hex(spec.colors[2]);
    this.rnd = rngFor(`clip-${spec.id}`);
    for (let i = 0; i < this.grain.length; i++) this.grain[i] = Math.round((this.rnd() * 2 - 1) * 3);
    this.idMask = textMask(spec.id, 26);
    this.roleMask = textMask(spec.role.toUpperCase(), 6);
    this.tagMask = textMask("SYNTHETIC", 4);
    for (let i = 0; i < 46; i++) {
      this.particles.push({
        x: this.rnd() * CLIP_W, y: this.rnd() * CLIP_H, size: 5 + Math.floor(this.rnd() * 10),
        speed: 20 + this.rnd() * 70, alpha: 0.18 + this.rnd() * 0.3, phase: this.rnd() * Math.PI * 2,
      });
    }
    for (let x = 0; x < CLIP_W; x++) {
      const fx = (x + 0.5) / 4 - 0.5;
      const x0 = Math.max(0, Math.min(LW - 2, Math.floor(fx)));
      this.xs0[x] = x0;
      this.xw[x] = Math.max(0, Math.min(1, fx - x0));
    }
  }

  /** Global camera offset (handheld shake) in output pixels. */
  private shake(t: number): [number, number] {
    if (this.spec.motion !== "handheld") return [0, 0];
    return [
      9 * Math.sin(t * 5.1) + 5 * Math.sin(t * 11.7 + 1.3) + 2 * Math.sin(t * 23.0),
      7 * Math.sin(t * 4.3 + 0.7) + 4 * Math.sin(t * 13.1 + 2.1),
    ];
  }

  private renderBackground(t: number): void {
    const { c0, c1, c2 } = this;
    const ang = 1.1 + 0.35 * Math.sin((2 * Math.PI * t) / CLIP_SEC);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const blobs = [0, 1, 2].map((i) => ({
      x: LW * (0.5 + 0.32 * Math.sin(t * (0.5 + 0.17 * i) + i * 2.1)),
      y: LH * (0.45 + 0.3 * Math.cos(t * (0.38 + 0.11 * i) + i * 1.3)),
      r: (this.spec.motion === "sun" && i === 0 ? 120 : 70 + 16 * i) * (1 + 0.08 * Math.sin(t * 2 + i)),
      k: this.spec.motion === "sun" && i === 0 ? 0.9 : 0.42 - 0.08 * i,
    }));
    if (this.spec.motion === "sun") {
      blobs[0].x = LW * 0.72;
      blobs[0].y = LH * 0.2 + 6 * Math.sin(t * 1.3);
    }
    for (let y = 0; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        const s = clamp01(0.5 + ((x - LW / 2) * ca + (y - LH / 2) * sa) / (LH * 0.9));
        let r = c0[0] + (c1[0] - c0[0]) * s;
        let g = c0[1] + (c1[1] - c0[1]) * s;
        let b = c0[2] + (c1[2] - c0[2]) * s;
        for (const bl of blobs) {
          const d2 = ((x - bl.x) ** 2 + (y - bl.y) ** 2) / (bl.r * bl.r);
          if (d2 < 1) {
            const f = (1 - d2) * (1 - d2) * bl.k;
            r += (c2[0] - r) * f;
            g += (c2[1] - g) * f;
            b += (c2[2] - b) * f;
          }
        }
        let k = 1;
        if (this.spec.motion === "stripes") k += 0.07 * (((x + y * 0.6 + t * 45) % 36) < 18 ? 1 : -1);
        if (this.spec.motion === "pushin") k += 0.25 * gauss(x + y * 0.5 - (t / CLIP_SEC) * 420 + 60, 0, 22);
        if (this.spec.motion === "bounce" && y > LH * 0.8) k *= 0.55;
        const v = 1 - 0.38 * (((x - LW / 2) / (LW / 2)) ** 2 * 0.5 + ((y - LH / 2) / (LH / 2)) ** 2 * 0.5);
        const o = (y * LW + x) * 3;
        this.bg[o] = r * k * v;
        this.bg[o + 1] = g * k * v;
        this.bg[o + 2] = b * k * v;
      }
    }
  }

  /** Bilinear upsample of the low-res background into a BGR frame (with optional per-row heat shimmer). */
  private upsample(px: Uint8Array, off: number, t: number, dx: number, dy: number): void {
    const bg = this.bg;
    const zoom = this.spec.motion === "handheld" ? 1.04 : 1;
    for (let y = 0; y < CLIP_H; y++) {
      const sy = (y - CLIP_H / 2 - dy) / zoom + CLIP_H / 2;
      const fy = (sy + 0.5) / 4 - 0.5;
      const y0 = Math.max(0, Math.min(LH - 2, Math.floor(fy)));
      const wy = clamp01(fy - y0);
      const shimmer = this.spec.motion === "sun" ? Math.round(3 * Math.sin(y * 0.045 + t * 9) * (1 - y / CLIP_H)) : 0;
      const shift = Math.round(-dx + shimmer);
      const row = off + y * CLIP_W * 3;
      for (let x = 0; x < CLIP_W; x++) {
        const xi = Math.max(0, Math.min(CLIP_W - 1, x + shift));
        const x0 = this.xs0[xi];
        const wx = this.xw[xi];
        const a = (y0 * LW + x0) * 3;
        const b = a + LW * 3;
        const o = row + x * 3;
        for (let c = 0; c < 3; c++) {
          const top = bg[a + c] + (bg[a + 3 + c] - bg[a + c]) * wx;
          const bot = bg[b + c] + (bg[b + 3 + c] - bg[b + c]) * wx;
          const v = top + (bot - top) * wy;
          px[o + 2 - c] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0; // BGR
        }
      }
    }
  }

  /** Alpha-composite the bottle sprite (bilinear, scaled) centred at (cx, cy). */
  private drawSprite(px: Uint8Array, off: number, cx: number, cy: number, scale: number): void {
    const sp = this.sprite;
    if (!sp) return;
    const w = sp.width * scale;
    const h = sp.height * scale;
    const x0 = Math.max(0, Math.floor(cx - w / 2));
    const x1 = Math.min(CLIP_W, Math.ceil(cx + w / 2));
    const y0 = Math.max(0, Math.floor(cy - h / 2));
    const y1 = Math.min(CLIP_H, Math.ceil(cy + h / 2));
    const d = sp.data;
    for (let y = y0; y < y1; y++) {
      const sy = (y + 0.5 - (cy - h / 2)) / scale - 0.5;
      const sy0 = Math.floor(sy);
      if (sy0 < 0 || sy0 >= sp.height - 1) continue;
      const wy = sy - sy0;
      for (let x = x0; x < x1; x++) {
        const sx = (x + 0.5 - (cx - w / 2)) / scale - 0.5;
        const sx0 = Math.floor(sx);
        if (sx0 < 0 || sx0 >= sp.width - 1) continue;
        const wx = sx - sx0;
        const i00 = (sy0 * sp.width + sx0) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + sp.width * 4;
        const i11 = i01 + 4;
        const w00 = (1 - wx) * (1 - wy) * d[i00 + 3];
        const w10 = wx * (1 - wy) * d[i10 + 3];
        const w01 = (1 - wx) * wy * d[i01 + 3];
        const w11 = wx * wy * d[i11 + 3];
        const a = (w00 + w10 + w01 + w11) / 255;
        if (a <= 0.002) continue;
        const o = off + (y * CLIP_W + x) * 3;
        for (let c = 0; c < 3; c++) {
          const v = (d[i00 + c] * w00 + d[i10 + c] * w10 + d[i01 + c] * w01 + d[i11 + c] * w11) / 255; // premultiplied
          const dst = o + 2 - c;
          px[dst] = Math.round(v + px[dst] * (1 - a));
        }
      }
    }
  }

  private drawMask(px: Uint8Array, off: number, m: TextMask, x0: number, y0: number, rgb: Rgb, alpha: number): void {
    for (let y = 0; y < m.height; y++) {
      const py = y0 + y;
      if (py < 0 || py >= CLIP_H) continue;
      for (let x = 0; x < m.width; x++) {
        const pxx = x0 + x;
        if (!m.mask[y * m.width + x] || pxx < 0 || pxx >= CLIP_W) continue;
        const o = off + (py * CLIP_W + pxx) * 3;
        px[o] = Math.round(px[o] * (1 - alpha) + rgb[2] * 255 * alpha);
        px[o + 1] = Math.round(px[o + 1] * (1 - alpha) + rgb[1] * 255 * alpha);
        px[o + 2] = Math.round(px[o + 2] * (1 - alpha) + rgb[0] * 255 * alpha);
      }
    }
  }

  private fillRect(px: Uint8Array, off: number, x0: number, y0: number, w: number, h: number, rgb: Rgb, alpha: number): void {
    for (let y = Math.max(0, y0); y < Math.min(CLIP_H, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(CLIP_W, x0 + w); x++) {
        const o = off + (y * CLIP_W + x) * 3;
        px[o] = Math.round(px[o] * (1 - alpha) + rgb[2] * 255 * alpha);
        px[o + 1] = Math.round(px[o + 1] * (1 - alpha) + rgb[1] * 255 * alpha);
        px[o + 2] = Math.round(px[o + 2] * (1 - alpha) + rgb[0] * 255 * alpha);
      }
    }
  }

  private bottlePose(t: number): { x: number; y: number; scale: number } {
    const base = { x: CLIP_W / 2, y: 820, scale: 1 };
    switch (this.spec.motion) {
      case "pushin":
        return { ...base, scale: 1 + 0.16 * (t / CLIP_SEC), y: 820 - 30 * (t / CLIP_SEC) };
      case "bounce": {
        // drop from above, bounce with decaying height (floor at y = 870)
        const g = 2600;
        let tt = t;
        let v0 = 0;
        let h0 = 780;
        let y = 870;
        for (let i = 0; i < 6; i++) {
          const tFall = (v0 + Math.sqrt(v0 * v0 + 2 * g * h0)) / g;
          if (tt <= tFall) {
            y = 870 - (h0 + v0 * tt - 0.5 * g * tt * tt);
            break;
          }
          tt -= tFall;
          v0 = Math.sqrt(2 * g * h0) * 0.45;
          h0 = 0;
          y = 870;
          if (v0 < 30) break;
        }
        return { ...base, y };
      }
      case "slide":
        return { ...base, x: CLIP_W * (0.8 - 0.3 * smooth(clamp01(t / CLIP_SEC))) };
      case "handheld":
        return { ...base, y: 800 + 10 * Math.sin(t * 1.6) };
      default:
        return { ...base, y: 820 + 14 * Math.sin(t * 1.4) };
    }
  }

  /** One frame as a complete top-down BMP file buffer (BGR24). */
  frameBmp(frame: number): Buffer {
    const t = frame / CLIP_FPS;
    const header = 54;
    const size = header + CLIP_W * CLIP_H * 3;
    const buf = Buffer.alloc(size);
    buf.write("BM", 0, "ascii");
    buf.writeUInt32LE(size, 2);
    buf.writeUInt32LE(header, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(CLIP_W, 18);
    buf.writeInt32LE(-CLIP_H, 22); // negative height = top-down rows
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(24, 28);
    buf.writeUInt32LE(CLIP_W * CLIP_H * 3, 34);
    const px = buf; // pixels start at `header`
    const [dx, dy] = this.shake(t);

    this.renderBackground(t);
    this.upsample(px, header, t, dx, dy);

    if (this.spec.motion === "ice" || this.spec.motion === "sun") {
      const tint: Rgb = this.spec.motion === "ice" ? [0.85, 0.95, 1] : [1, 0.95, 0.8];
      for (const p of this.particles) {
        const y = ((p.y - p.speed * t) % CLIP_H + CLIP_H) % CLIP_H;
        const x = p.x + 12 * Math.sin(t * 1.5 + p.phase);
        this.fillRect(px, header, Math.round(x), Math.round(y), p.size, p.size, tint, p.alpha * (this.spec.motion === "sun" ? 0.4 : 1));
      }
    }
    if (this.spec.bottle) {
      const pose = this.bottlePose(t);
      this.drawSprite(px, header, pose.x + dx, pose.y + dy, pose.scale);
    }

    // grain (luma, ±3)
    const gx = Math.floor(this.rnd() * 256);
    const gy = Math.floor(this.rnd() * 256);
    for (let y = 0; y < CLIP_H; y++) {
      const grow = ((y + gy) & 255) * 256;
      const row = header + y * CLIP_W * 3;
      for (let x = 0; x < CLIP_W; x++) {
        const n = this.grain[grow + ((x + gx) & 255)];
        const o = row + x * 3;
        for (let c = 0; c < 3; c++) {
          const v = px[o + c] + n;
          px[o + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }

    // labels: big slot id, role, SYNTHETIC tag, progress bar
    const idX = Math.round((CLIP_W - this.idMask.width) / 2);
    const roleX = Math.round((CLIP_W - this.roleMask.width) / 2);
    for (const [ox, oy, a] of OUTLINE) {
      this.drawMask(px, header, this.idMask, idX + ox * 2, 150 + oy * 2, [0, 0, 0], a);
      this.drawMask(px, header, this.roleMask, roleX + ox, 360 + oy, [0, 0, 0], a);
    }
    this.drawMask(px, header, this.idMask, idX, 150, [1, 1, 1], 1);
    this.drawMask(px, header, this.roleMask, roleX, 360, [1, 1, 1], 0.95);
    this.fillRect(px, header, 20, 20, this.tagMask.width + 24, this.tagMask.height + 18, [0, 0, 0], 0.55);
    this.drawMask(px, header, this.tagMask, 32, 29, [1, 0.85, 0.2], 1);
    this.fillRect(px, header, 0, CLIP_H - 8, Math.round((CLIP_W * (frame + 1)) / (CLIP_FPS * CLIP_SEC)), 8, [1, 1, 1], 0.55);
    return buf;
  }
}

/**
 * README figures generated from REAL project data (no hand-drawn numbers):
 *   docs/img/pipeline.svg      counts from data/slot-assets.json + public/metrics.json
 *   docs/img/timeline.svg      anatomy of variant H1_B1_C1: scenes, transitions, words, cut, ducking curve
 *   docs/img/matrix.svg        3x2x2 factorial grid with duration and measured render time per cell
 *   docs/img/render-times.svg  render seconds per variant (from public/metrics.json)
 *   npm run docs:figures
 */
import fs from "node:fs";
import path from "node:path";
import { FPS, MUSIC_VOLUME, SlotAssetsSchema, TRANSITION_FRAMES } from "../src/contract";
import { bodyCutMs, CTA_HOLD_FRAMES, msToFrame, musicVolume, sceneFrames, sceneStarts, totalFrames, voiceWindows } from "../src/lib/timing";
import { composeManifest, DEFAULT_AXES, enumerateVariants, slotIds } from "../src/lib/variants";

const C = {
  bg: "#0E0E10", panel: "#17171A", line: "#2A2A2F", text: "#EDEDEF", muted: "#8E8E96",
  accent: "#FFE135", ice: "#7FE3FF", ok: "#3DDC97", hook: "#FF8A3D", body: "#7FE3FF", cta: "#FFE135",
};
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SFMono-Regular', Consolas, monospace";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">` +
  `<rect width="${w}" height="${h}" rx="18" fill="${C.bg}"/>${body}</svg>\n`;
const text = (x: number, y: number, s: string, o: { size?: number; fill?: string; weight?: number; anchor?: string; mono?: boolean } = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 14}" fill="${o.fill ?? C.text}" font-weight="${o.weight ?? 500}" text-anchor="${o.anchor ?? "start"}"${o.mono ? ` font-family="${MONO}"` : ""}>${esc(s)}</text>`;

type Metrics = { rendered: number; avgRenderSec: number | null; videosPerHour: number | null; machine: { cpu: string; cores: number }; settings: { concurrency: number; parallel: number }; wallSec: number; rows: { variant_id: string; render_sec: string; duration_sec: string; status: string }[] };

function pipeline(assets: ReturnType<typeof SlotAssetsSchema.parse>, metrics: Metrics | null) {
  const ids = slotIds(assets);
  const files = Object.keys(assets.provenance).length;
  const n = ids.hooks.length * ids.bodies.length * ids.ctas.length;
  const stages = [
    { t: "AI ASSETS", big: `${files} files`, sub: [`${assets.pack.provenance === "synthetic" ? "synthetic placeholders" : "pre-generated offline"}`, "video · voice · packshot · music"] },
    { t: "INGEST", big: "normalize", sub: ["720×1280 H.264 · −16 LUFS VO", "word timings · slot limits"] },
    { t: "SLOTS", big: `${ids.hooks.length}·${ids.bodies.length}·${ids.ctas.length}`, sub: ["hooks · bodies · CTAs", "data/slot-assets.json"] },
    { t: "VARIANTS", big: `${n}`, sub: [`${ids.hooks.length}×${ids.bodies.length}×${ids.ctas.length} factorial`, "pure fn → manifest.json"] },
    { t: "RENDER", big: metrics ? `${metrics.rendered} MP4` : "MP4", sub: [metrics?.avgRenderSec ? `avg ${metrics.avgRenderSec.toFixed(1)} s / video` : "npm run render", metrics ? `${metrics.machine.cores}-thread desktop` : "local batch"] },
  ];
  const w = 1200, bw = 200, gap = (w - 60 - bw * 5) / 4;
  let body = text(30, 44, "Pipeline: pre-generated AI assets → auto-montage → measured ad variants", { size: 20, weight: 800 });
  stages.forEach((s, i) => {
    const x = 30 + i * (bw + gap);
    const col = [C.hook, C.muted, C.body, C.accent, C.ok][i];
    body += `<rect x="${x}" y="70" width="${bw}" height="150" rx="14" fill="${C.panel}" stroke="${C.line}"/>`;
    body += `<rect x="${x}" y="70" width="${bw}" height="4" rx="2" fill="${col}"/>`;
    body += text(x + 16, 100, s.t, { size: 12, fill: C.muted, weight: 700 });
    body += text(x + 16, 144, s.big, { size: 30, weight: 900, fill: col });
    s.sub.forEach((line, k) => (body += text(x + 16, 178 + k * 20, line, { size: 12.5, fill: C.muted })));
    if (i < 4) body += `<path d="M${x + bw + 6} 145 h${gap - 14}" stroke="${C.muted}" stroke-width="2" marker-end="url(#a)"/>`;
  });
  body = `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${C.muted}"/></marker></defs>` + body;
  return svg(w, 250, body);
}

function timeline(assets: ReturnType<typeof SlotAssetsSchema.parse>) {
  const ids = slotIds(assets);
  const m = composeManifest(assets, ids.hooks[0], ids.bodies[0], ids.ctas[0], { ...DEFAULT_AXES });
  const total = totalFrames(m);
  const starts = sceneStarts(m);
  const W = 1200, L = 130, R = 30, px = (f: number) => L + ((W - L - R) * f) / total;
  const rows = { video: 90, words: 150, overlay: 205, music: 260 };
  let b = text(30, 40, `Anatomy of one variant: ${m.variantId} (${(total / FPS).toFixed(2)} s @ ${FPS} fps, ${total} frames)`, { size: 19, weight: 800 });
  b += text(30, 62, "Everything below is computed from the manifest — the same math drives the Player, the renderer and verify.", { size: 13, fill: C.muted });
  const label = (y: number, s: string) => (b += text(30, y + 5, s, { size: 12, fill: C.muted, weight: 700 }));
  label(rows.video + 18, "VIDEO");
  label(rows.words + 10, "VOICE WORDS");
  label(rows.overlay + 8, "OVERLAYS");
  label(rows.music + 18, "MUSIC BED");
  m.scenes.forEach((s, i) => {
    const len = sceneFrames(s) + (i === 2 ? CTA_HOLD_FRAMES : 0);
    const col = [C.hook, C.body, C.cta][i];
    const x0 = px(starts[i]), x1 = px(starts[i] + len);
    if (s.slot === "body" && s.videoSrcs.length > 1) {
      const cut = px(starts[i] + msToFrame(bodyCutMs(s)));
      b += `<rect x="${x0}" y="${rows.video}" width="${cut - x0 - 1}" height="36" rx="6" fill="${col}" opacity="0.85"/>`;
      b += `<rect x="${cut + 1}" y="${rows.video}" width="${x1 - cut - 1}" height="36" rx="6" fill="${col}" opacity="0.6"/>`;
      b += `<line x1="${cut}" y1="${rows.video - 8}" x2="${cut}" y2="${rows.video + 44}" stroke="${C.text}" stroke-dasharray="3 3"/>`;
      b += text(cut, rows.video - 12, "cut on word gap + punch-in", { size: 11, fill: C.text, anchor: "middle" });
      b += text(x0 + 8, rows.video + 23, `${s.id} · clip a`, { size: 12, weight: 800, fill: C.bg });
      b += text(cut + 8, rows.video + 23, "clip b", { size: 12, weight: 800, fill: C.bg });
    } else {
      b += `<rect x="${x0}" y="${rows.video}" width="${x1 - x0}" height="36" rx="6" fill="${col}" opacity="${i === 2 ? 0.9 : 0.85}"/>`;
      b += text(x0 + 8, rows.video + 23, i === 2 ? `${s.id} · end card (packshot)` : `${s.id} · clip`, { size: 12, weight: 800, fill: C.bg });
    }
    if (i < 2) {
      const tx = px(starts[i + 1]);
      b += `<rect x="${tx}" y="${rows.video - 4}" width="${px(starts[i + 1] + TRANSITION_FRAMES) - tx}" height="44" fill="#fff" opacity="0.25"/>`;
    }
  });
  b += text(px(starts[2] + sceneFrames(m.scenes[2])) + 4, rows.video + 54, `+${CTA_HOLD_FRAMES}f hold`, { size: 11, fill: C.muted });
  b += text(px(starts[1]) + 2, rows.video + 54, `${TRANSITION_FRAMES}f slide`, { size: 11, fill: C.muted });
  b += text(px(starts[2]) + 2, rows.video + 54, `${TRANSITION_FRAMES}f fade`, { size: 11, fill: C.muted });
  const words = voiceWindows(m);
  m.scenes.forEach((s, i) =>
    s.words.forEach((w) => {
      const x0 = px(starts[i] + msToFrame(w.startMs)), x1 = px(starts[i] + msToFrame(w.endMs));
      b += `<rect x="${x0}" y="${rows.words}" width="${Math.max(2, x1 - x0)}" height="16" rx="3" fill="${[C.hook, C.body, C.cta][i]}"/>`;
    }),
  );
  b += text(L, rows.words + 34, `${words.length} words · each caption word lights up exactly in its window (TikTok-style pages via @remotion/captions)`, { size: 11.5, fill: C.muted });
  const hookEnd = Math.min(3 * FPS, sceneFrames(m.scenes[0]) - TRANSITION_FRAMES);
  b += `<rect x="${px(0)}" y="${rows.overlay}" width="${px(hookEnd) - px(0)}" height="14" rx="4" fill="${C.hook}" opacity="0.5"/>`;
  b += text(px(0) + 6, rows.overlay + 11, `on-screen hook: "${m.scenes[0].onScreen ?? ""}"`, { size: 11, weight: 700, fill: C.text });
  b += `<rect x="${px(starts[2])}" y="${rows.overlay}" width="${px(total) - px(starts[2])}" height="14" rx="4" fill="${C.cta}" opacity="0.5"/>`;
  b += text(px(starts[2]) + 6, rows.overlay + 11, "brand + CTA pill", { size: 11, weight: 700, fill: C.text });
  const pts: string[] = [];
  for (let f = 0; f <= total; f += 1) pts.push(`${px(f).toFixed(1)},${(rows.music + 40 - (musicVolume(f, words, total, MUSIC_VOLUME) / MUSIC_VOLUME) * 36).toFixed(1)}`);
  b += `<polyline points="${pts.join(" ")}" fill="none" stroke="${C.ok}" stroke-width="2"/>`;
  b += text(L, rows.music + 60, `volume ${MUSIC_VOLUME} → ducked under every word (6-frame ramps) → faded out over the last second`, { size: 11.5, fill: C.muted });
  for (let s = 0; s <= total / FPS; s += 2) {
    b += `<line x1="${px(s * FPS)}" y1="335" x2="${px(s * FPS)}" y2="341" stroke="${C.muted}"/>`;
    b += text(px(s * FPS), 356, `${s}s`, { size: 11, fill: C.muted, anchor: "middle", mono: true });
  }
  return svg(W, 372, b);
}

function matrix(assets: ReturnType<typeof SlotAssetsSchema.parse>, metrics: Metrics | null) {
  const all = enumerateVariants(assets);
  const ids = slotIds(assets);
  const cols = ids.bodies.flatMap((bd) => ids.ctas.map((c) => ({ bd, c })));
  const W = 1200, L = 270, cw = (W - L - 30) / cols.length, rh = 74;
  let b = text(30, 40, `${ids.hooks.length} hooks × ${ids.bodies.length} bodies × ${ids.ctas.length} CTAs = ${all.length} variants (full factorial, style/music/format held constant)`, { size: 18, weight: 800 });
  cols.forEach((col, j) => (b += text(L + j * cw + cw / 2, 78, `${col.bd} · ${col.c}`, { size: 13, weight: 800, anchor: "middle", fill: C.muted, mono: true })));
  ids.hooks.forEach((h, i) => {
    const y = 92 + i * rh;
    b += text(30, y + 30, h, { size: 16, weight: 900, fill: C.hook, mono: true });
    b += text(70, y + 30, `“${assets.slots[h].onScreen ?? assets.slots[h].text}”`, { size: 12.5, fill: C.text, weight: 700 });
    b += text(70, y + 50, assets.slots[h].text.length > 32 ? `${assets.slots[h].text.slice(0, 31)}…` : assets.slots[h].text, { size: 11, fill: C.muted });
    cols.forEach((col, j) => {
      const id = `${h}_${col.bd}_${col.c}`;
      const m = all.find((v) => v.variantId === id);
      const row = metrics?.rows.find((r) => r.variant_id === id);
      const x = L + j * cw + 6;
      b += `<rect x="${x}" y="${y}" width="${cw - 12}" height="${rh - 10}" rx="10" fill="${C.panel}" stroke="${row?.status === "ok" ? C.ok : C.line}"/>`;
      b += text(x + 12, y + 24, id, { size: 13, weight: 800, mono: true });
      b += text(x + 12, y + 46, m ? `${(totalFrames(m) / FPS).toFixed(1)} s video` : "", { size: 11.5, fill: C.muted });
      if (row?.status === "ok") b += text(x + cw - 24, y + 46, `rendered ${Number(row.render_sec).toFixed(1)} s`, { size: 11.5, fill: C.ok, anchor: "end" });
    });
  });
  return svg(W, 92 + ids.hooks.length * rh + 16, b);
}

function renderTimes(metrics: Metrics) {
  const rows = metrics.rows.filter((r) => r.status === "ok");
  const W = 1200, H = 330, L = 60, B = 270, max = Math.max(...rows.map((r) => Number(r.render_sec))) * 1.15;
  const bw = (W - L - 40) / rows.length;
  let b = text(30, 40, `Measured batch render: ${rows.length} videos, avg ${metrics.avgRenderSec?.toFixed(2)} s/video (~${metrics.videosPerHour}/hour extrapolated)`, { size: 18, weight: 800 });
  b += text(30, 62, `${metrics.machine.cpu} · ${metrics.machine.cores} threads · concurrency ${metrics.settings.concurrency} · parallel ${metrics.settings.parallel} · wall ${metrics.wallSec.toFixed(1)} s (from out/manifest.csv)`, { size: 12, fill: C.muted });
  rows.forEach((r, i) => {
    const v = Number(r.render_sec), h = ((B - 90) * v) / max, x = L + i * bw + 6;
    b += `<rect x="${x}" y="${B - h}" width="${bw - 12}" height="${h}" rx="5" fill="${C.ice}" opacity="0.85"/>`;
    b += text(x + (bw - 12) / 2, B - h - 6, v.toFixed(1), { size: 11, anchor: "middle", mono: true });
    b += text(x + (bw - 12) / 2, B + 18, r.variant_id.replace(/_/g, " "), { size: 10, anchor: "middle", fill: C.muted, mono: true });
  });
  const ay = B - ((B - 90) * (metrics.avgRenderSec ?? 0)) / max;
  b += `<line x1="${L}" y1="${ay}" x2="${W - 30}" y2="${ay}" stroke="${C.accent}" stroke-dasharray="5 4"/>`;
  b += text(W - 34, ay - 6, `avg ${metrics.avgRenderSec?.toFixed(2)} s`, { size: 12, fill: C.accent, anchor: "end", weight: 700 });
  b += `<line x1="${L}" y1="${B}" x2="${W - 30}" y2="${B}" stroke="${C.line}"/>`;
  return svg(W, H, b);
}

function main() {
  const assets = SlotAssetsSchema.parse(JSON.parse(fs.readFileSync("data/slot-assets.json", "utf8")));
  const metrics: Metrics | null = fs.existsSync("public/metrics.json") ? JSON.parse(fs.readFileSync("public/metrics.json", "utf8")) : null;
  const dir = path.resolve("docs/img");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pipeline.svg"), pipeline(assets, metrics));
  fs.writeFileSync(path.join(dir, "timeline.svg"), timeline(assets));
  fs.writeFileSync(path.join(dir, "matrix.svg"), matrix(assets, metrics));
  if (metrics?.rows.some((r) => r.status === "ok")) fs.writeFileSync(path.join(dir, "render-times.svg"), renderTimes(metrics));
  console.log(`figures -> docs/img (${metrics ? "with" : "without"} render metrics)`);
}

main();

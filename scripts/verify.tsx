/**
 * Quality gate:  npm run verify   (= tsc --noEmit && tsx scripts/verify.tsx). Exit 1 on any FAIL.
 * Contract, variant math (12 + 100-scale simulation), timing invariants, word-timing accuracy,
 * preflight failure isolation, SSR smoke, client/node boundary, size budgets, repo hygiene.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { renderToString } from "react-dom/server";
import { Player } from "@remotion/player";
import {
  FORMATS, FPS, ManifestSchema, SLOT_MAX_SEC, SlotAssetsSchema, TRANSITION_FRAMES, validateManifest,
  type Manifest, type SlotAssets,
} from "../src/contract";
import { bodyCutMs, CTA_HOLD_FRAMES, musicVolume, sceneFrames, sceneStarts, totalFrames, voiceWindows } from "../src/lib/timing";
import { composeManifest, DEFAULT_AXES, enumerateVariants } from "../src/lib/variants";
import { preflight } from "../src/lib/preflight";
import { detectSpeechSegments, estimateWordTimings } from "../src/lib/media/vad";
import { AdVariant } from "../src/remotion/AdVariant";
import { ctaPill } from "../src/remotion/components/Overlays";

let fails = 0;
let passes = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passes++;
  else fails++;
  if (!ok) console.log(`FAIL ${name}${detail ? `  (${detail})` : ""}`);
};
const section = (s: string) => console.log(`· ${s}`);

async function main() {
  /* 1. slot assets ---------------------------------------------------------------- */
  section("slot assets");
  const rawAssets = JSON.parse(fs.readFileSync("data/slot-assets.json", "utf8"));
  const parsedAssets = SlotAssetsSchema.safeParse(rawAssets);
  check("slot-assets.json matches SlotAssetsSchema", parsedAssets.success);
  if (!parsedAssets.success) return;
  const assets: SlotAssets = parsedAssets.data;
  const referenced = new Set<string>([assets.brand.packshotSrc]);
  for (const s of Object.values(assets.slots)) {
    s.videoSrcs.forEach((v) => referenced.add(v));
    referenced.add(s.audioSrc);
    check(`slot ${s.id} within ${s.slot} limit`, s.durationSec <= SLOT_MAX_SEC[s.slot] + 1e-6, `${s.durationSec}s`);
  }
  Object.values(assets.music).forEach((m) => referenced.add(m.src));
  Object.values(assets.sfx).forEach((m) => referenced.add(m.src));
  const missing = [...referenced].filter((r) => !fs.existsSync(path.join("public", r)));
  check("every referenced asset exists in public/", missing.length === 0, missing.join(", "));
  check("paths are public-relative with forward slashes", [...referenced].every((r) => !r.startsWith("/") && !r.includes("\\")));

  /* 2. contract -------------------------------------------------------------------- */
  section("contract");
  const good = composeManifest(assets, "H1", "B1", "C1", { ...DEFAULT_AXES });
  check("composed manifest passes zod", ManifestSchema.safeParse(good).success);
  check("composed manifest passes validateManifest", validateManifest(good).length === 0, validateManifest(good).join("; "));
  check("rejects schema version 1", !ManifestSchema.safeParse({ ...good, schema: 1 }).success);
  check("rejects bad variantId", !ManifestSchema.safeParse({ ...good, variantId: "hook1-body2" }).success);
  check("rejects 2 scenes", !ManifestSchema.safeParse({ ...good, scenes: good.scenes.slice(0, 2) }).success);
  check("rejects bad scene id", !ManifestSchema.safeParse({ ...good, scenes: [{ ...good.scenes[0], id: "X1" }, good.scenes[1], good.scenes[2]] }).success);
  const swapped: Manifest = { ...good, scenes: [good.scenes[1], good.scenes[0], good.scenes[2]] };
  check("validateManifest catches scene order", validateManifest(swapped).some((p) => p.includes("must be hook")));
  const tooLong: Manifest = { ...good, scenes: [{ ...good.scenes[0], durationSec: 4.5 }, good.scenes[1], good.scenes[2]] };
  check("validateManifest catches slot max", validateManifest(tooLong).some((p) => p.includes("max")));
  const unsorted: Manifest = { ...good, scenes: [{ ...good.scenes[0], words: [...good.scenes[0].words].reverse() }, good.scenes[1], good.scenes[2]] };
  check("validateManifest catches unsorted words", good.scenes[0].words.length < 2 || validateManifest(unsorted).some((p) => p.includes("sorted")));

  /* 3. variants -------------------------------------------------------------------- */
  section("variants");
  const all = enumerateVariants(assets);
  check("3 hooks x 2 bodies x 2 CTAs = 12 variants", all.length === 12, `${all.length}`);
  check("variant ids unique", new Set(all.map((m) => m.variantId)).size === all.length);
  check("all 12 valid", all.every((m) => ManifestSchema.safeParse(m).success && validateManifest(m).length === 0));
  check("default id is short (H1_B1_C1)", all[0]?.variantId === "H1_B1_C1", all[0]?.variantId);
  const alt = composeManifest(assets, "H2", "B2", "C2", { style: "clean", musicId: "M2", format: "1x1" });
  check("non-default axes extend the id", alt.variantId === "H2_B2_C2_clean_m2_f11", alt.variantId);
  check("non-default variant valid", ManifestSchema.safeParse(alt).success);
  // Scale simulation: 5 hooks x 4 bodies x 5 CTAs by adding rows in memory, no code change.
  const scaled: SlotAssets = structuredClone(assets);
  const cloneSlot = (from: string, to: string) => { scaled.slots[to] = { ...scaled.slots[from], id: to }; };
  ["H4", "H5"].forEach((id) => cloneSlot("H1", id));
  ["B3", "B4"].forEach((id) => cloneSlot("B1", id));
  ["C3", "C4", "C5"].forEach((id) => cloneSlot("C1", id));
  const hundred = enumerateVariants(scaled);
  check("scale simulation 5x4x5 = 100 with no code change", hundred.length === 100 && new Set(hundred.map((m) => m.variantId)).size === 100, `${hundred.length}`);
  check("100 simulated variants all valid", hundred.every((m) => validateManifest(m).length === 0));

  const variantsDir = path.resolve("data/variants");
  const vfiles = fs.existsSync(variantsDir) ? fs.readdirSync(variantsDir).filter((f) => f.endsWith(".json")) : [];
  check("data/variants has 12 manifests (npm run build:variants)", vfiles.length === 12, `${vfiles.length}`);
  for (const f of vfiles) {
    const m = ManifestSchema.safeParse(JSON.parse(fs.readFileSync(path.join(variantsDir, f), "utf8")));
    check(`variant file valid: ${f}`, m.success && validateManifest(m.data).length === 0 && `${m.data.variantId}.json` === f);
  }

  /* 4. timing invariants ------------------------------------------------------------ */
  section("timing");
  for (const m of all) {
    const lens = m.scenes.map((s) => sceneFrames(s));
    const expected = lens.reduce((a, b) => a + b, 0) + CTA_HOLD_FRAMES - 2 * TRANSITION_FRAMES;
    check(`${m.variantId} totalFrames formula`, totalFrames(m) === expected);
    const w = voiceWindows(m);
    let overlap = false;
    for (const a of w) for (const b of w) if (a.scene !== b.scene && a.start < b.end && b.start < a.end) overlap = true;
    check(`${m.variantId} no VO overlap across scenes`, !overlap);
    const starts = sceneStarts(m);
    check(`${m.variantId} scene tail covers transition`, m.scenes.slice(0, -1).every((s, i) => {
      const lastEnd = starts[i] + (s.words[s.words.length - 1].endMs / 1000) * FPS;
      return lastEnd <= starts[i + 1];
    }));
    check(`${m.variantId} <= 16.5 s`, totalFrames(m) / FPS <= SLOT_MAX_SEC.hook + SLOT_MAX_SEC.body + SLOT_MAX_SEC.cta + 1);
  }
  const body = assets.slots.B1;
  const cut = bodyCutMs(body);
  check("body cut lands on a word gap", body.words.some((w, i) => i < body.words.length - 1 && cut >= w.endMs - 1 && cut <= body.words[i + 1].startMs + 1));
  const win = voiceWindows(good);
  const total = totalFrames(good);
  const midWord = (win[0].start + win[0].end) / 2;
  check("music ducked while a word is spoken", musicVolume(midWord, win, total, 0.12) <= 0.05 + 1e-9);
  check("music at full bed in a pause", musicVolume(1, win, total, 0.12) > 0.1);
  check("music fades to 0 at the end", musicVolume(total, win, total, 0.12) === 0);
  check("CTA pill from last sentence", ctaPill("Get yours. Link in bio.") === "LINK IN BIO");

  /* 5. word timing accuracy (silence path) on synthetic tone bursts with known truth ----- */
  section("word timings");
  const sr = 16000;
  const truth: { startMs: number; endMs: number }[] = [];
  let tMs = 200;
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 12; i++) {
    const dur = 180 + rand() * 240;
    truth.push({ startMs: tMs, endMs: tMs + dur });
    tMs += dur + 90 + rand() * 70;
  }
  const pcm = new Float32Array(Math.ceil(((tMs + 300) / 1000) * sr));
  truth.forEach((w, k) => {
    for (let s = Math.floor((w.startMs / 1000) * sr); s < (w.endMs / 1000) * sr; s++) pcm[s] = 0.4 * Math.sin((2 * Math.PI * (180 + k * 23) * s) / sr);
  });
  for (let s = 0; s < pcm.length; s++) pcm[s] += (rand() - 0.5) * 0.002; // noise floor ~ -60 dB
  const segs = detectSpeechSegments(pcm, sr);
  const words = estimateWordTimings(truth.map((_, i) => `w${i}`).join(" "), segs);
  const errs = words.map((w, i) => Math.max(Math.abs(w.startMs - truth[i].startMs), Math.abs(w.endMs - truth[i].endMs)));
  const maxErr = Math.max(...errs);
  check("silence-path word timing error < 120 ms on every word", words.length === truth.length && maxErr < 120, `max ${maxErr.toFixed(0)} ms`);
  console.log(`  silence-path max word error: ${maxErr.toFixed(1)} ms (12 words)`);

  /* 6. preflight isolates failures (A5) ------------------------------------------------ */
  section("preflight");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ryze-pf-"));
  const corrupt = await preflight({ ...good, scenes: "nope" }, { publicDir: path.resolve("public") });
  check("corrupt manifest -> skipped with reason", !corrupt.ok && corrupt.problems.length > 0);
  const missingAsset = await preflight({ ...good, scenes: [{ ...good.scenes[0], audioSrc: "packs/none/missing.mp3" }, good.scenes[1], good.scenes[2]] }, { publicDir: path.resolve("public") });
  check("missing asset -> skipped with reason", !missingAsset.ok && missingAsset.problems.some((p) => p.includes("missing file")));
  const fine = await preflight(good, { publicDir: path.resolve("public") });
  check("good manifest passes preflight", fine.ok, fine.problems.join("; "));
  fs.rmSync(tmp, { recursive: true, force: true });

  /* 7. SSR smoke (does not throw; hook text + CTA present) ------------------------------- */
  section("ssr");
  const ssr = (m: Manifest, f: number) =>
    renderToString(
      <Player component={AdVariant} inputProps={m} durationInFrames={totalFrames(m)} fps={FPS}
        compositionWidth={FORMATS[m.format].width} compositionHeight={FORMATS[m.format].height} initialFrame={f} acknowledgeRemotionLicense />,
    );
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
  for (const m of [good, alt]) {
    const tot = totalFrames(m);
    for (const f of [0, 20, Math.floor(tot / 2), tot - 3]) {
      try {
        const html = ssr(m, f);
        const hookOk = f !== 20 || !m.scenes[0].onScreen || html.includes(esc(m.scenes[0].onScreen));
        check(`ssr ${m.variantId} f=${f}`, html.length > 500 && hookOk);
      } catch (e) {
        check(`ssr ${m.variantId} f=${f} threw ${(e as Error).message.slice(0, 80)}`, false);
      }
    }
    check(`ssr ${m.variantId} CTA pill at end`, ssr(m, tot - 3).includes(esc(ctaPill(m.scenes[2].text))));
  }

  /* 8. boundaries, budgets, hygiene --------------------------------------------------- */
  section("hygiene");
  const clientFiles = ["src/lib/timing.ts", "src/lib/variants.ts", "src/contract.ts", "src/lib/media/vad.ts"];
  const walk = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  for (const f of [...clientFiles, ...walk("src/remotion"), ...walk("src/components")]) {
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    check(`no node-only import in ${f.replace(/\\/g, "/")}`, !/from\s+["'](node:|fs["']|path["']|child_process)/.test(src) && !src.includes("lib/preflight") && !src.includes("lib/media/ffmpeg"));
  }
  const publicFiles = walk("public");
  const big = publicFiles.filter((f) => fs.statSync(f).size > 8 * 2 ** 20);
  check("no public file > 8 MB", big.length === 0, big.join(", "));
  const publicMb = publicFiles.reduce((a, f) => a + fs.statSync(f).size, 0) / 2 ** 20;
  check("public/ total <= 45 MB", publicMb <= 45, `${publicMb.toFixed(1)} MB`);
  console.log(`  public/ = ${publicMb.toFixed(1)} MB in ${publicFiles.length} files`);
  let tracked: string[] = [];
  try { tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean); } catch { /* not a git checkout */ }
  check("no .env file tracked (except .env.example)", !tracked.some((f) => /(^|\/)\.env(?!\.example$)/.test(f)));
  check("no .vercel/ tracked", !tracked.some((f) => f.startsWith(".vercel/")));
  const secretRe = /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[bp]-[A-Za-z0-9-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  const leaky = tracked.filter((f) => /\.(ts|tsx|js|mjs|json|md|csv|yml|yaml|txt)$/.test(f) && fs.existsSync(f) && secretRe.test(fs.readFileSync(f, "utf8")));
  check("no secret-looking strings in tracked text files", leaky.length === 0, leaky.join(", "));

  const metricsPath = "public/metrics.json";
  if (fs.existsSync(metricsPath)) {
    const mj = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
    check("metrics.json: 12 rendered", mj.rendered === 12, `${mj.rendered}`);
  }

  console.log(fails ? `\nFAILED ${fails} / ${passes + fails}` : `\nALL PASSED (${passes} checks)`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

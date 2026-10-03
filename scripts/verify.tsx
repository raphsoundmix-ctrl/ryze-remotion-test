/**
 * One-command quality gate:  npm run verify   (= tsc --noEmit && tsx scripts/verify.tsx)
 * 1) word-timestamp normalizer, 2) every data/manifests/*.json passes zod,
 * 3) SSR smoke of the composition at several frames (hook/CTA present, no throw).
 * Add new checks below as phases land. Exit code 1 on any FAIL.
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { Player } from "@remotion/player";
import { AIVideoTemplate } from "../src/remotion/AIVideoTemplate";
import { ManifestSchema, FPS, WIDTH, HEIGHT, type Manifest } from "../src/schema";
import { sceneFrames, totalFrames } from "../src/lib/timing";
import { normalizeWords } from "../src/lib/words";

let fails = 0;
let passes = 0;
const check = (name: string, ok: boolean) => {
  ok ? passes++ : fails++;
  if (!ok) console.log("FAIL", name);
};

/* 1. normalizer ------------------------------------------------------------ */
let r = normalizeWords([{ text: "Hello", start: 0, end: 0.4 }, { text: "world", start: 0.5, end: 1.0 }], "Hello world");
check("words: seconds objects", r.source === "provider" && r.words[1].startMs === 500 && Math.abs(r.durationSec - 1.35) < 1e-6);
r = normalizeWords([{ word: "Hi", start_time: 0, end_time: 700 }, { word: "there", start_time: 800, end_time: 1500 }], "Hi there");
check("words: ms autodetect", r.words[1].endMs === 1500);
r = normalizeWords([["a", 0, 0.2], ["b", 0.3, 0.6]], "a b");
check("words: tuples", r.words.length === 2 && r.words[1].startMs === 300);
r = normalizeWords({ alignment: { characters: ["H", "i", " ", "y", "o"], character_start_times_seconds: [0, .1, .2, .3, .4], character_end_times_seconds: [.1, .2, .3, .4, .5] } }, "Hi yo");
check("words: char alignment", r.words.length === 2 && r.words[1].startMs === 300);
r = normalizeWords([{ text: " ", start: 0, end: 0.1 }, { text: "ok", start: 0.1, end: 0.4 }], "ok");
check("words: drops spacing events", r.words.length === 1);
r = normalizeWords(undefined, "This is a fallback sentence for estimation");
check("words: estimated fallback", r.source === "estimated" && r.words.length === 7);

/* 2. manifests ------------------------------------------------------------- */
const dir = path.resolve("data/manifests");
const manifests: Manifest[] = [];
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".json")) : []) {
  const p = ManifestSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  check(`manifest valid: ${f}`, p.success);
  if (p.success) manifests.push(p.data);
}
check("at least 1 manifest (run `npm run seed`)", manifests.length > 0);

/* 3. SSR smoke ------------------------------------------------------------- */
const ssr = (m: Manifest, f: number) =>
  renderToString(
    <Player component={AIVideoTemplate} inputProps={m} durationInFrames={totalFrames(m)} fps={FPS}
      compositionWidth={WIDTH} compositionHeight={HEIGHT} initialFrame={f} acknowledgeRemotionLicense />,
  );
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

for (const m of manifests) {
  const total = totalFrames(m);
  const s0 = sceneFrames(m.scenes[0]);
  for (const f of [0, 20, Math.floor(s0 / 2), s0 + 5, total - 3]) {
    try {
      const html = ssr(m, f);
      check(`ssr ${m.variantId} f=${f}`, html.length > 500 && (f >= 90 || html.includes(esc(m.hook))));
    } catch (e) {
      check(`ssr ${m.variantId} f=${f} THROW ${(e as Error).message.slice(0, 80)}`, false);
    }
  }
  check(`ssr ${m.variantId} CTA at end`, ssr(m, total - 3).includes(esc(m.cta)));
}

console.log(fails ? `\nFAILED ${fails} / ${passes + fails}` : `\nALL PASSED (${passes} checks)`);
process.exit(fails ? 1 : 0);

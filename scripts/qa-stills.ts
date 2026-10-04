/**
 * Visual QA stills: one variant, fixed frames, every format -> out/qa/<format>/<label>.png
 *   npm run qa:stills                      # H1_B1_C1, hormozi
 *   npm run qa:stills -- --hook H2 --body B2 --cta C2 --style clean
 * Frames: hook overlay, hook caption, body before/after the cut, CTA end card mid, last frame.
 */
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { FORMATS, SlotAssetsSchema, type Format, type Style } from "../src/contract";
import { bodyCutMs, msToFrame, sceneStarts, totalFrames } from "../src/lib/timing";
import { composeManifest, slotIds } from "../src/lib/variants";
import { renderPublicDir } from "../src/lib/media/render-public";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

async function main() {
  const assets = SlotAssetsSchema.parse(JSON.parse(fs.readFileSync("data/slot-assets.json", "utf8")));
  const browserExecutable = arg("--browser", process.env.REMOTION_BROWSER_EXECUTABLE ?? "") || null;
  const formats = (arg("--formats", Object.keys(FORMATS).join(",")).split(",")) as Format[];
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts"), publicDir: renderPublicDir().dir });

  const ids = slotIds(assets);
  for (const format of formats) {
    const m = composeManifest(assets, arg("--hook", ids.hooks[0]), arg("--body", ids.bodies[0]), arg("--cta", ids.ctas[0]), {
      style: arg("--style", "hormozi") as Style, format, musicId: "M1",
    });
    const starts = sceneStarts(m);
    const [hook, body, cta] = m.scenes;
    const cut = starts[1] + Math.round(msToFrame(bodyCutMs(body)));
    const frames: Record<string, number> = {
      "1-hook-overlay": 18,
      "2-hook-caption": starts[0] + Math.round(msToFrame(hook.words[Math.min(2, hook.words.length - 1)].startMs)) + 3,
      "3-body-before-cut": cut - 4,
      "4-body-after-cut": cut + 8,
      "5-cta-endcard": starts[2] + Math.round(msToFrame(cta.words[cta.words.length - 1].startMs)) + 2,
      "6-last": totalFrames(m) - 1,
    };
    const composition = await selectComposition({ serveUrl, id: "AdVariant", inputProps: m, browserExecutable });
    const dir = path.resolve("out/qa", format);
    fs.mkdirSync(dir, { recursive: true });
    for (const [label, frame] of Object.entries(frames)) {
      const output = path.join(dir, `${label}.png`);
      await renderStill({ composition, serveUrl, frame, output, inputProps: m, browserExecutable, scale: 0.5 });
      console.log(`${m.variantId} ${format} f=${frame} -> ${path.relative(process.cwd(), output)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

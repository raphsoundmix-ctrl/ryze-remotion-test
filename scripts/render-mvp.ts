/**
 * data/manifests/*.json -> out/<variantId>.mp4 + out/manifest.csv
 * Bundles ONCE, then renders in a loop and records seconds per video (the number to quote in the README).
 *   npm run render                       # all manifests
 *   npm run render -- --only ugc         # filter by variantId substring
 *   npm run render -- --concurrency 4    # frames rendered in parallel per video
 *
 * First run downloads Chrome Headless Shell (Remotion does this itself).
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { ManifestSchema, FPS, type Manifest } from "../src/schema";
import { totalFrames } from "../src/lib/timing";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const only = arg("--only");
  const concurrency = arg("--concurrency") ? Number(arg("--concurrency")) : null;

  const manifestsDir = path.resolve("data/manifests");
  const outDir = path.resolve("out");
  fs.mkdirSync(outDir, { recursive: true });

  const manifests: Manifest[] = fs
    .readdirSync(manifestsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(manifestsDir, f), "utf8"))))
    .filter((m) => !only || m.variantId.includes(only));

  if (manifests.length === 0) {
    console.error("No manifests in data/manifests (run `npm run seed` or `npm run generate`).");
    process.exit(1);
  }

  console.log("Bundling Remotion project once…");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts") });

  // Metrics columns are EMPTY on purpose: fill from Meta/TikTok exports, joined on variant_id.
  const header = ["variant_id", "file", "duration_sec", "render_sec", "caption_style", "mode", "hook", "spend", "ctr", "hook_rate_3s", "hold_rate"];
  const rows: string[][] = [];
  const csv = () => [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

  for (const [i, m] of manifests.entries()) {
    const t0 = Date.now();
    const file = path.join(outDir, `${m.variantId}.mp4`);
    try {
      const composition = await selectComposition({ serveUrl, id: "AIVideo", inputProps: m });
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: file,
        inputProps: m,
        concurrency,
        onProgress: ({ progress }) => process.stdout.write(`\r[${i + 1}/${manifests.length}] ${m.variantId} ${(progress * 100).toFixed(0)}%   `),
      });
      const sec = (Date.now() - t0) / 1000;
      rows.push([m.variantId, path.relative(process.cwd(), file), (totalFrames(m) / FPS).toFixed(1), sec.toFixed(1), m.captionStyle, m.mode, m.hook, "", "", "", ""]);
      console.log(`\r[${i + 1}/${manifests.length}] ${m.variantId} done in ${sec.toFixed(1)}s            `);
    } catch (e) {
      console.error(`\nFAILED ${m.variantId}:`, e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
    fs.writeFileSync(path.join(outDir, "manifest.csv"), csv()); // after every video: partial runs keep their data
  }

  if (rows.length) {
    const avg = rows.reduce((a, r) => a + Number(r[3]), 0) / rows.length;
    console.log(`\n${rows.length} video(s). Avg ${avg.toFixed(1)} s/video on this machine -> ~${Math.floor(3600 / avg)} videos/hour at concurrency=${concurrency ?? "auto"}. See out/manifest.csv`);
  }
}

main();

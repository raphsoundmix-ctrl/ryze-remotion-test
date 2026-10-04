/**
 * data/slot-assets.json -> data/variants/<variantId>.json (v2 manifests, one per video).
 *   npm run build:variants                     # 3 hooks x 2 bodies x 2 CTAs = 12 (style/music/format fixed)
 *   npm run build:variants -- --style clean --music M2 --format 4x5   # same grid on other axes
 */
import fs from "node:fs";
import path from "node:path";
import { FORMATS, ManifestSchema, SlotAssetsSchema, STYLES, validateManifest, type Format, type Style } from "../src/contract";
import { DEFAULT_AXES, enumerateVariants } from "../src/lib/variants";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main() {
  const style = (arg("--style") ?? DEFAULT_AXES.style) as Style;
  const format = (arg("--format") ?? DEFAULT_AXES.format) as Format;
  const musicArg = arg("--music") ?? DEFAULT_AXES.musicId;
  const musicId = musicArg === "none" ? null : musicArg;
  if (!STYLES.includes(style)) throw new Error(`--style must be one of ${STYLES.join(", ")}`);
  if (!(format in FORMATS)) throw new Error(`--format must be one of ${Object.keys(FORMATS).join(", ")}`);

  const assets = SlotAssetsSchema.parse(JSON.parse(fs.readFileSync("data/slot-assets.json", "utf8")));
  if (musicId && !assets.music[musicId]) throw new Error(`--music ${musicId} not in pack (have ${Object.keys(assets.music).join(", ")})`);

  const outDir = path.resolve("data/variants");
  fs.mkdirSync(outDir, { recursive: true });
  if (!process.argv.includes("--keep")) {
    for (const f of fs.readdirSync(outDir)) if (f.endsWith(".json")) fs.rmSync(path.join(outDir, f));
  }

  const manifests = enumerateVariants(assets, { style, format, musicId });
  for (const m of manifests) {
    ManifestSchema.parse(m);
    const problems = validateManifest(m);
    if (problems.length) throw new Error(`${m.variantId}: ${problems.join("; ")}`);
    fs.writeFileSync(path.join(outDir, `${m.variantId}.json`), JSON.stringify(m, null, 2) + "\n");
  }
  console.log(`${manifests.length} manifests -> data/variants/ (pack ${assets.pack.id}, ${assets.pack.provenance}; style=${style} music=${musicId ?? "none"} format=${format})`);
  console.log(manifests.map((m) => m.variantId).join("  "));
}

main();

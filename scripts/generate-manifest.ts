/**
 * idea(s) -> data/manifests/<variantId>.json  (real OpenRouter + fal.ai if keys are set)
 *   npm run generate -- "idea one" "idea two" "idea three"
 *   npm run generate -- --style clean --mock "idea"
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { ManifestSchema, CaptionStyleSchema } from "../src/schema";
import { hasLiveKeys, runPipeline } from "../src/lib/pipeline";

async function main() {
  const argv = process.argv.slice(2);
  let style = "hormozi";
  let forceMock = false;
  const ideas: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mock") forceMock = true;
    else if (argv[i] === "--style") style = argv[++i] ?? style;
    else ideas.push(argv[i]);
  }
  const captionStyle = CaptionStyleSchema.parse(style);

  if (ideas.length === 0) {
    console.error('Usage: npm run generate -- [--style hormozi|clean] [--mock] "idea 1" "idea 2" ...');
    process.exit(1);
  }

  const live = !forceMock && hasLiveKeys();
  if (!forceMock && !live) console.warn("WARN: OPENROUTER_API_KEY / FAL_KEY missing -> running in MOCK mode");

  const dir = path.resolve("data/manifests");
  fs.mkdirSync(dir, { recursive: true });

  for (const idea of ideas) {
    console.log(`\n=== ${live ? "LIVE" : "MOCK"}: ${idea}`);
    try {
      const m = ManifestSchema.parse(await runPipeline({ idea, captionStyle, mode: live ? "live" : "mock" }, (l) => console.log(l)));
      const file = path.join(dir, `${m.variantId}.json`);
      fs.writeFileSync(file, JSON.stringify(m, null, 2));
      console.log("saved", path.relative(process.cwd(), file));
    } catch (e) {
      console.error("FAILED:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  }
}

main();

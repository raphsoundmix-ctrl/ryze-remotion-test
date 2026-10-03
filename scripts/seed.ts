import fs from "node:fs";
import path from "node:path";
import { SEED_PRESETS, buildMockManifest } from "../src/lib/mock";

const dir = path.resolve("data/manifests");
fs.mkdirSync(dir, { recursive: true });
for (const p of SEED_PRESETS) {
  const m = buildMockManifest({ idea: p.idea, variantId: p.variantId, captionStyle: p.captionStyle, look: p.look, script: p.script });
  fs.writeFileSync(path.join(dir, `${m.variantId}.json`), JSON.stringify(m, null, 2));
  console.log("seeded", `data/manifests/${m.variantId}.json`);
}

import fs from "node:fs";
import path from "node:path";
import Dashboard from "../src/components/Dashboard";
import { ManifestSchema, type Manifest } from "../src/schema";

/** data/manifests/*.json become dashboard presets (commit live-generated ones -> instant demo on Vercel). */
function loadPresets(): Manifest[] {
  const dir = path.join(process.cwd(), "data", "manifests");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => {
      const parsed = ManifestSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      return parsed.success ? [parsed.data] : [];
    });
}

export default function Page() {
  return <Dashboard presets={loadPresets()} />;
}

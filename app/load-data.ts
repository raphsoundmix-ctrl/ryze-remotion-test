import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SlotAssetsSchema } from "../src/contract";
import { MetricsSchema, type Loaded, type PageData, type Preview } from "../src/components/data";

/**
 * Build-time only: the page is statically generated from these files; rebuild after render/previews.
 * Paths are written as literal segments so the bundler's file tracing stays scoped to them.
 */
function readJson<T>(file: string, schema: z.ZodType<T>): Loaded<T> {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
  if (!fs.existsSync(file)) return { kind: "missing", path: rel };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { kind: "invalid", path: rel, problem: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "invalid", path: rel, problem: z.prettifyError(parsed.error) };
}

function listPreviews(): Preview[] {
  const dir = path.join(process.cwd(), "public", "previews");
  if (!fs.existsSync(dir)) return [];
  const files = new Set(fs.readdirSync(dir));
  return [...files]
    .filter((f) => f.endsWith(".mp4"))
    .sort()
    .map((f) => {
      const variantId = f.slice(0, -".mp4".length);
      const poster = `${variantId}.jpg`;
      return { variantId, video: `/previews/${f}`, poster: files.has(poster) ? `/previews/${poster}` : null };
    });
}

export function loadPageData(): PageData {
  return {
    assets: readJson(path.join(process.cwd(), "data", "slot-assets.json"), SlotAssetsSchema),
    metrics: readJson(path.join(process.cwd(), "public", "metrics.json"), MetricsSchema),
    previews: listPreviews(),
  };
}

/**
 * Public dir for RENDERING (node-only). public/packs holds 720p proxies (light for the browser Player and Vercel);
 * ingest keeps a 1080p mezzanine of source clips that were >= 1080x1920 in media-cache/<packId>/ (gitignored).
 * When a mezzanine exists, the renderer gets a mirror of public/ (hard links, no copies on the same volume)
 * with the mezzanine clips overlaid at the same relative paths, so manifests stay identical.
 */
import fs from "node:fs";
import path from "node:path";

const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];

function mirror(from: string, to: string, skip: (rel: string) => boolean = () => false): number {
  let n = 0;
  for (const file of walk(from)) {
    const rel = path.relative(from, file);
    if (skip(rel.split(path.sep).join("/"))) continue;
    const dest = path.join(to, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.rmSync(dest, { force: true });
    try {
      fs.linkSync(file, dest);
    } catch {
      fs.copyFileSync(file, dest);
    }
    n++;
  }
  return n;
}

export function renderPublicDir(): { dir: string; mezzanineClips: number } {
  const cache = path.resolve("media-cache");
  const packs = fs.existsSync(cache)
    ? fs.readdirSync(cache, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name)
    : [];
  if (packs.length === 0) return { dir: path.resolve("public"), mezzanineClips: 0 };
  const dir = path.resolve("out/.render-public");
  fs.rmSync(dir, { recursive: true, force: true });
  mirror(path.resolve("public"), dir, (rel) => rel.startsWith("previews/"));
  const mezzanineClips = packs.reduce((a, p) => a + mirror(path.join(cache, p), path.join(dir, "packs", p)), 0);
  return { dir, mezzanineClips };
}

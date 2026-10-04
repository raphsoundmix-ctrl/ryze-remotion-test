/**
 * Open an asset pack (directory or .zip via fflate), locate its root (the folder holding pack.csv),
 * map the canonical tree of pack-spec.ts onto the real files (case-insensitive, alternative extensions),
 * and read pack.csv. Node-only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { csvRecords } from "./csv";
import { acceptedExtensions, PACK_TREE, SIDE_CAR_SUFFIXES, type PackEntry } from "./pack-spec";

export type OpenedPack = { root: string; source: string; isZip: boolean; cleanup: () => void };

const IGNORED = (name: string) => name.startsWith(".") || name === "__MACOSX" || name === "Thumbs.db" || name === "desktop.ini";

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else if (e.isFile()) out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

/** Folder that contains pack.csv (searched up to 3 levels deep), else the folder that contains hooks/, else the input. */
function findRoot(dir: string): string {
  const files = walk(dir);
  const csv = files.filter((f) => /(^|\/)pack\.csv$/i.test(f)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (csv && csv.split("/").length <= 4) return path.join(dir, path.dirname(csv));
  const hooks = files.find((f) => /(^|\/)hooks\/[^/]+$/i.test(f));
  return hooks ? path.join(dir, path.dirname(path.dirname(hooks))) : dir;
}

export function openPack(input: string): OpenedPack {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) throw new Error(`input not found: ${input}`);
  if (fs.statSync(abs).isDirectory()) return { root: findRoot(abs), source: abs, isZip: false, cleanup: () => undefined };
  if (!/\.zip$/i.test(abs)) throw new Error(`input must be a directory or a .zip: ${input}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ryze-ingest-"));
  const entries = unzipSync(new Uint8Array(fs.readFileSync(abs)));
  for (const [name, data] of Object.entries(entries)) {
    const norm = name.replace(/\\/g, "/");
    if (norm.endsWith("/")) continue;
    const parts = norm.split("/").filter((p) => p && p !== ".");
    if (parts.some((p) => p === "..") || path.isAbsolute(norm)) throw new Error(`unsafe path in zip: ${name}`);
    const dest = path.join(tmp, ...parts);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
  return { root: findRoot(tmp), source: abs, isZip: true, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

export type TreeScan = {
  /** canonical file → actual pack-relative path */
  found: Map<string, string>;
  missingRequired: PackEntry[];
  missingOptional: PackEntry[];
  /** files that are neither canonical entries nor timing sidecars */
  extra: string[];
  /** canonical voice file → sidecar paths present next to it */
  sidecars: Map<string, { wordsJson?: string; srt?: string; truth?: string }>;
};

const stripExt = (f: string) => f.replace(/\.[^./]+$/, "");

export function scanTree(root: string): TreeScan {
  const files = walk(root);
  const lower = new Map(files.map((f) => [f.toLowerCase(), f]));
  const found = new Map<string, string>();
  const used = new Set<string>();
  const missingRequired: PackEntry[] = [];
  const missingOptional: PackEntry[] = [];
  const sidecars = new Map<string, { wordsJson?: string; srt?: string; truth?: string }>();
  for (const e of PACK_TREE) {
    const stem = stripExt(e.file).toLowerCase();
    const canonicalExt = path.extname(e.file).toLowerCase();
    const exts = [canonicalExt, ...acceptedExtensions(e).filter((x) => x !== canonicalExt)];
    const hit = exts.map((x) => lower.get(stem + x)).find((x): x is string => !!x);
    if (!hit) {
      (e.required ? missingRequired : missingOptional).push(e);
      continue;
    }
    found.set(e.file, hit);
    used.add(hit);
    if (e.kind === "voice") {
      const s = stripExt(hit).toLowerCase();
      const sc = {
        wordsJson: lower.get(`${s}.words.json`),
        srt: lower.get(`${s}.srt`),
        truth: lower.get(`${s}.truth.json`),
      };
      for (const f of [sc.wordsJson, sc.srt, sc.truth]) if (f) used.add(f);
      sidecars.set(e.file, sc);
    }
  }
  const extra = files.filter((f) => !used.has(f) && !SIDE_CAR_SUFFIXES.some((s) => f.toLowerCase().endsWith(s)));
  return { found, missingRequired, missingOptional, extra, sidecars };
}

export type CsvRow = Record<string, string>;

/** Media class of a file, so hooks/H1.mp4 (video) and hooks/H1.mp3 (voice) never share a pack.csv row. */
const mediaClass = (file: string) => {
  const ext = (file.split(".").pop() ?? "").toLowerCase();
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  return ext;
};
const stemKey = (file: string) => `${stripExt(file.replace(/\\/g, "/")).toLowerCase()}#${mediaClass(file)}`;

/** pack.csv rows keyed by lower-case path without extension + media class (hooks/H1.mp3 also matches a delivered hooks/H1.wav). */
export function readPackCsv(root: string, scan: TreeScan): { rows: CsvRow[]; byStem: Map<string, CsvRow> } {
  const rel = scan.found.get("pack.csv");
  if (!rel) return { rows: [], byStem: new Map() };
  const rows = csvRecords(fs.readFileSync(path.join(root, rel), "utf8"));
  const byStem = new Map(rows.filter((r) => r.file).map((r) => [stemKey(r.file), r]));
  return { rows, byStem };
}

export const rowFor = (byStem: Map<string, CsvRow>, canonicalFile: string): CsvRow | undefined =>
  byStem.get(stemKey(canonicalFile));

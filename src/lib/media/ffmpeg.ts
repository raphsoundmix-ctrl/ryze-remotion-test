/**
 * Node-only ffmpeg/ffprobe helpers. Never import from src/remotion/** or src/components/**.
 * Uses Remotion's bundled binaries (@remotion/compositor-<platform>-<arch>[-msvc|-gnu|-musl]),
 * falls back to `ffmpeg` / `ffprobe` on PATH. Always spawns with an argument array (no shell).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { parseWav } from "./wav";

type Bin = "ffmpeg" | "ffprobe";
const cache = new Map<Bin, string>();

/** Absolute path of the bundled binary, or the bare name (PATH lookup) when no compositor package resolves. */
export function resolveBinary(name: Bin): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const req = createRequire(path.join(process.cwd(), "package.json"));
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  let found: string = name;
  for (const suffix of ["-msvc", "-gnu", "-musl", ""]) {
    try {
      const pkg = req.resolve(`@remotion/compositor-${process.platform}-${process.arch}${suffix}/package.json`);
      const candidate = path.join(path.dirname(pkg), exe);
      if (fs.existsSync(candidate)) {
        found = candidate;
        break;
      }
    } catch {
      // package for this libc flavour not installed: try the next suffix
    }
  }
  cache.set(name, found);
  return found;
}

export type RunResult = { code: number; stdout: Buffer; stderr: string };

/** Spawn a binary with an argument array; resolves with exit code, stdout bytes and stderr text (never rejects on exit code). */
export function run(bin: string, args: string[], input?: Buffer): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: err }));
    p.stdin.on("error", () => undefined); // EPIPE when the process exits early: reported through the exit code
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

const tail = (s: string, n = 6) => s.trim().split(/\r?\n/).slice(-n).join(" | ");

/** Run ffmpeg (banner hidden, overwrite on). Throws with the stderr tail on a non-zero exit. */
export async function ffmpeg(args: string[], input?: Buffer): Promise<Buffer> {
  const r = await run(resolveBinary("ffmpeg"), ["-hide_banner", "-nostdin", "-y", ...args], input);
  if (r.code !== 0) throw new Error(`ffmpeg exited ${r.code}: ${tail(r.stderr)}`);
  return r.stdout;
}

/** ffmpeg variant that also returns stderr (needed to read filter logs). Throws on a non-zero exit. */
export async function ffmpegWithLog(args: string[]): Promise<RunResult> {
  const r = await run(resolveBinary("ffmpeg"), ["-hide_banner", "-nostdin", "-y", ...args]);
  if (r.code !== 0) throw new Error(`ffmpeg exited ${r.code}: ${tail(r.stderr)}`);
  return r;
}

export type ProbeStream = {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  sample_rate?: string;
  channels?: number;
  duration?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
};
export type Probe = { streams: ProbeStream[]; format: { duration?: string; size?: string; format_name?: string } };

export async function probe(file: string): Promise<Probe> {
  const r = await run(resolveBinary("ffprobe"), [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file,
  ]);
  if (r.code !== 0) throw new Error(`ffprobe failed on ${path.basename(file)}: ${tail(r.stderr, 3)}`);
  return JSON.parse(r.stdout.toString("utf8")) as Probe;
}

export const videoStream = (p: Probe) => p.streams.find((s) => s.codec_type === "video");
export const audioStream = (p: Probe) => p.streams.find((s) => s.codec_type === "audio");

/** Container duration in seconds (falls back to the longest stream), 0 when unknown. */
export function probeDuration(p: Probe): number {
  const d = Number(p.format.duration);
  if (Number.isFinite(d) && d > 0) return d;
  const ds = p.streams.map((s) => Number(s.duration)).filter((x) => Number.isFinite(x) && x > 0);
  return ds.length ? Math.max(...ds) : 0;
}

/** Display dimensions (rotation metadata of ±90° swaps width and height). */
export function displaySize(s: ProbeStream): { width: number; height: number } {
  const w = s.width ?? 0;
  const h = s.height ?? 0;
  const rot = Number(s.tags?.rotate ?? s.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  return Math.abs(rot) % 180 === 90 ? { width: h, height: w } : { width: w, height: h };
}

/** Decode any audio file to mono float PCM at the given sample rate (via 16-bit WAV on stdout). */
export async function decodePcmMono(file: string, sampleRate: number): Promise<Float32Array> {
  const wav = await ffmpeg(["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(sampleRate), "-c:a", "pcm_s16le", "-f", "wav", "-"]);
  return parseWav(wav).mono;
}

/**
 * Streaming writer into an ffmpeg process's stdin with backpressure (used for BMP frame pipes).
 * `end()` resolves when ffmpeg exits 0 and rejects otherwise.
 */
export function ffmpegWriter(args: string[]) {
  const p = spawn(resolveBinary("ffmpeg"), ["-hide_banner", "-nostdin", "-y", ...args], {
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"],
  });
  let err = "";
  let failed: Error | null = null;
  p.stderr.on("data", (d: Buffer) => {
    err += d.toString();
    if (err.length > 100_000) err = err.slice(-50_000);
  });
  const done = new Promise<void>((resolve, reject) => {
    p.on("error", (e) => {
      failed = e;
      reject(e);
    });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${tail(err)}`))));
  });
  p.stdin.on("error", (e) => {
    failed = e;
  });
  return {
    write(buf: Uint8Array): Promise<void> {
      if (failed) return Promise.reject(failed);
      if (p.stdin.write(buf)) return Promise.resolve();
      return new Promise<void>((resolve) => p.stdin.once("drain", () => resolve()));
    },
    end(): Promise<void> {
      p.stdin.end();
      return done;
    },
  };
}

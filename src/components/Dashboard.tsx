"use client";

import React, { useEffect, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { AIVideoTemplate } from "../remotion/AIVideoTemplate";
import { FPS, HEIGHT, WIDTH, ManifestSchema, type CaptionStyle, type Manifest, type StreamEvent } from "../schema";
import { totalFrames } from "../lib/timing";
import { SEED_PRESETS, buildMockManifest } from "../lib/mock";

const fallback = (): Manifest => {
  const p = SEED_PRESETS[0];
  return buildMockManifest({ idea: p.idea, variantId: p.variantId, captionStyle: p.captionStyle, look: p.look, script: p.script });
};

const card = "rounded-2xl border border-white/10 bg-[#0D1B33]/70 p-4";
const label = "mb-2 block text-xs font-semibold uppercase tracking-wider text-blue-300/80";
const input = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#1B4FD8]";

export default function Dashboard({ presets }: { presets: Manifest[] }) {
  const initial = presets[0] ?? fallback();
  const [manifest, setManifest] = useState<Manifest>(initial);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [idea, setIdea] = useState("Short ad for a posture-correcting desk chair");
  const [style, setStyle] = useState<CaptionStyle>("hormozi");
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [code, setCode] = useState("");
  const [cfg, setCfg] = useState<{ live: boolean; needsCode: boolean }>({ live: false, needsCode: false });
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/generate").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  const load = (m: Manifest) => {
    setManifest(m);
    setJsonText(JSON.stringify(m, null, 2));
    setJsonError(null);
  };

  const onJson = (text: string) => {
    setJsonText(text);
    try {
      const r = ManifestSchema.safeParse(JSON.parse(text));
      if (r.success) {
        setManifest(r.data);
        setJsonError(null);
      } else {
        const i = r.error.issues[0];
        setJsonError(`${i.path.join(".") || "root"}: ${i.message}`);
      }
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const generate = async () => {
    setBusy(true);
    setLogs([`> ${mode.toUpperCase()}: "${idea}"`]);
    const push = (m: string) => setLogs((l) => [...l, m]);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": code },
        body: JSON.stringify({ idea, captionStyle: style, mode }),
      });
      if (!res.ok || !res.body) {
        push(`ERROR ${res.status}: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? "request failed"}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "log") push(ev.message);
          else if (ev.type === "error") push(`ERROR: ${ev.message}`);
          else {
            load(ev.manifest);
            push(`DONE: ${ev.manifest.variantId}`);
          }
        }
      }
    } catch (e) {
      push(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([jsonText], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${manifest.variantId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const frames = totalFrames(manifest);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-extrabold">Ryze Video Engine <span className="text-[#1B4FD8]">prototype</span></h1>
          <p className="mt-1 text-sm text-slate-400">
            idea → script (OpenRouter) → B-roll + voice (fal.ai) → manifest.json → one Remotion template. Preview renders in the browser; MP4 via <code>npm run render</code>.
          </p>
        </header>

        <section className={card}>
          <span className={label}>Presets (data/manifests)</span>
          <div className="flex flex-wrap gap-2">
            {presets.length === 0 && <span className="text-sm text-slate-400">No presets: run <code>npm run seed</code></span>}
            {presets.map((p) => (
              <button
                key={p.variantId}
                onClick={() => load(p)}
                className={`rounded-lg border px-3 py-2 text-sm ${manifest.variantId === p.variantId ? "border-[#1B4FD8] bg-[#1B4FD8]/20" : "border-white/10 hover:border-white/30"}`}
              >
                {p.title} <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">{p.mode}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={card}>
          <span className={label}>Generate</span>
          <textarea className={input} rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select className={`${input} !w-auto`} value={style} onChange={(e) => setStyle(e.target.value as CaptionStyle)}>
              <option value="hormozi">Captions: hormozi</option>
              <option value="clean">Captions: clean</option>
            </select>
            <div className="flex overflow-hidden rounded-lg border border-white/10 text-sm">
              {(["mock", "live"] as const).map((m) => (
                <button
                  key={m}
                  disabled={m === "live" && !cfg.live}
                  onClick={() => setMode(m)}
                  title={m === "live" && !cfg.live ? "Live disabled: no API keys / access code on this deployment" : ""}
                  className={`px-3 py-2 uppercase disabled:opacity-30 ${mode === m ? "bg-[#1B4FD8]" : "bg-black/20"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            {mode === "live" && cfg.needsCode && (
              <input className={`${input} !w-40`} type="password" placeholder="access code" value={code} onChange={(e) => setCode(e.target.value)} />
            )}
            <button
              onClick={generate}
              disabled={busy || idea.trim().length < 3}
              className="ml-auto rounded-lg bg-[#1B4FD8] px-5 py-2 text-sm font-bold disabled:opacity-40"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
          </div>
          <div ref={logRef} className="mt-3 h-32 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed text-emerald-300/90">
            {logs.length === 0 ? <span className="text-slate-500">status log…</span> : logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </section>

        <section className={card}>
          <div className="mb-2 flex items-center justify-between">
            <span className={`${label} !mb-0`}>manifest.json (editable, live preview)</span>
            {jsonError ? <span className="text-xs text-red-400">⚠ {jsonError}</span> : <span className="text-xs text-emerald-400">✓ valid</span>}
          </div>
          <textarea
            spellCheck={false}
            className={`${input} h-80 font-mono text-xs`}
            value={jsonText}
            onChange={(e) => onJson(e.target.value)}
          />
        </section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
          <Player
            key={manifest.variantId}
            component={AIVideoTemplate}
            inputProps={manifest}
            durationInFrames={frames}
            fps={FPS}
            compositionWidth={WIDTH}
            compositionHeight={HEIGHT}
            controls
            loop
            acknowledgeRemotionLicense
            style={{ width: "100%", aspectRatio: "9 / 16" }}
          />
        </div>
        <div className={`${card} text-xs text-slate-300`}>
          <div><b>{manifest.variantId}</b></div>
          <div className="mt-1">{(frames / FPS).toFixed(1)}s · {manifest.scenes.length} scenes · {manifest.captionStyle} · {manifest.mode}</div>
          <div className="mt-1 text-slate-500">models: {manifest.models.llm} / {manifest.models.tts} / {manifest.models.video}</div>
          <button onClick={download} className="mt-3 w-full rounded-lg border border-white/15 py-2 font-semibold hover:border-white/40">
            Download manifest.json
          </button>
          <p className="mt-2 text-slate-500">Put it in <code>data/manifests/</code> → <code>npm run render</code> → MP4 in <code>out/</code></p>
        </div>
      </aside>
    </main>
  );
}

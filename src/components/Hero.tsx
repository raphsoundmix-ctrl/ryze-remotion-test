import type { ReactNode } from "react";
import type { SlotAssets } from "../contract";
import { BuildTimer } from "./BuildTimer";
import { ProvenanceBadge } from "./chrome";
import type { Loaded, Metrics } from "./data";
import { DASH, fmtSec } from "./format";
import { ChevronRightIcon } from "./icons";
import { packStats, type PackStats } from "./pack";

type Stage = "input" | "engine" | "output";
type Step = { stage: Stage; title: string; value: string; unit: string; note: ReactNode };

const STAGE_TONE: Record<Stage, string> = {
  input: "border-line-strong text-muted",
  engine: "border-accent/50 text-accent",
  output: "border-ok/50 text-ok",
};

function renderStep(metrics: Loaded<Metrics>): Step {
  if (metrics.kind === "missing") return { stage: "output", title: "Render", value: DASH, unit: "MP4", note: "Batch not rendered yet" };
  if (metrics.kind === "invalid") return { stage: "output", title: "Render", value: DASH, unit: "MP4", note: "metrics.json unreadable" };
  const m = metrics.data;
  return { stage: "output", title: "Render", value: String(m.rendered), unit: "MP4", note: `avg ${fmtSec(m.avgRenderSec)}/video` };
}

const isAi = (a: SlotAssets | null) => a?.pack.provenance === "pre-generated";

function steps(stats: PackStats | null, assets: SlotAssets | null, metrics: Loaded<Metrics>): Step[] {
  const timing = stats?.timingSources.length ? ` · via ${stats.timingSources.join(", ")}` : "";
  return [
    {
      stage: "input",
      title: isAi(assets) ? "AI assets" : "Pack assets",
      value: stats ? String(stats.files) : DASH,
      unit: "files",
      note: "video · voice · music · packshot",
    },
    { stage: "engine", title: "Ingest", value: stats ? String(stats.words) : DASH, unit: "words timed", note: `normalize · loudness · word timings${timing}` },
    {
      stage: "engine",
      title: "Slots",
      value: stats ? `${stats.hooks}·${stats.bodies}·${stats.ctas}` : DASH,
      unit: "",
      note: "hooks · bodies · CTAs",
    },
    {
      stage: "engine",
      title: "Variants",
      value: stats ? String(stats.variants) : DASH,
      unit: stats ? `= ${stats.hooks}×${stats.bodies}×${stats.ctas}` : "",
      note: assets ? <BuildTimer assets={assets} /> : "needs an ingested pack",
    },
    renderStep(metrics),
  ];
}

function PipelineStrip({ items }: { items: Step[] }) {
  return (
    <div className="mt-10 overflow-hidden rounded-lg border border-line bg-surface/70">
      <div aria-hidden="true" className="ruler h-3 border-b border-line" />
      <ol aria-label="Pipeline" className="grid lg:grid-cols-5">
        {items.map((s, i) => (
          <li key={s.title} className="relative border-b border-line px-4 py-4 last:border-b-0 lg:border-r lg:border-b-0 lg:px-5 lg:py-5 lg:last:border-r-0">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="eyebrow whitespace-nowrap">
                <span className="font-mono">{String(i + 1).padStart(2, "0")}</span> {s.title}
              </span>
              <span className={`rounded-sm border px-1.5 py-px font-mono text-[10px] whitespace-nowrap uppercase tracking-[0.1em] ${STAGE_TONE[s.stage]}`}>
                {s.stage}
              </span>
            </div>
            <p className="mt-3 flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="font-mono text-[26px] font-semibold leading-none tracking-tight text-text">{s.value}</span>
              {s.unit ? <span className="font-mono text-[12px] text-muted">{s.unit}</span> : null}
            </p>
            <p className="mt-2 text-[12.5px] leading-snug text-muted">{s.note}</p>
            {i < items.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-3 left-6 z-10 flex size-6 rotate-90 items-center justify-center rounded-full border border-line bg-bg text-muted lg:top-1/2 lg:-right-3 lg:bottom-auto lg:left-auto lg:-translate-y-1/2 lg:rotate-0"
              >
                <ChevronRightIcon size={12} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Hero({ assets, metrics }: { assets: Loaded<SlotAssets>; metrics: Loaded<Metrics> }) {
  const pack = assets.kind === "ok" ? assets.data : null;
  const stats = pack ? packStats(pack) : null;

  return (
    <section id="top" aria-labelledby="top-title" className="border-b border-line">
      <div className="mx-auto max-w-[1240px] px-4 pt-10 pb-12 sm:px-6 lg:pt-16 lg:pb-16">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {pack ? <ProvenanceBadge provenance={pack.pack.provenance} /> : null}
          <span className="eyebrow">Test task · Video Editor (Remotion)</span>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end lg:gap-12">
          <h1 id="top-title" className="text-[clamp(40px,7vw,72px)] leading-[0.95] font-black tracking-[-0.03em]">
            {stats ? (
              <>
                {stats.clips} {isAi(pack) ? "AI clips" : "clips"} in.
                <br />
                <span className="text-accent">{stats.variants} ad variants</span> out.
              </>
            ) : (
              <>
                AI clips in.
                <br />
                <span className="text-accent">Ad variants</span> out.
              </>
            )}
          </h1>
          <div>
            <p className="text-[15px] leading-relaxed text-muted">
              <span className="text-text">NORDA Ad Engine</span> is a Remotion auto-montage prototype: pre-generated footage, voice and
              music drop into hook, body and CTA slots, and one template turns every combination into a finished ad, previewed live in
              your browser and batch-rendered to MP4 with measured times.
            </p>
            <a
              href="#playground"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-[14px] font-extrabold text-on-accent transition-shadow duration-150 ease-out hover:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_28%,transparent)]"
            >
              Open the playground
              <ChevronRightIcon size={14} className="rotate-90" />
            </a>
          </div>
        </div>
        <PipelineStrip items={steps(stats, pack, metrics)} />
      </div>
    </section>
  );
}

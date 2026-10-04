import type { ReactNode } from "react";
import type { SlotAssets } from "../contract";
import { InputNotice, LoadNotice, SectionHeader } from "./chrome";
import type { Loaded, Metrics, MetricsRow, Preview } from "./data";
import { cellNumber, fmtStamp } from "./format";
import { DownloadIcon } from "./icons";
import { OpenInPlayer, PreviewCard } from "./PreviewCard";
import { MetricTiles, RenderTable } from "./RenderMetrics";
import { parseVariantId } from "./selection";

type Props = { metrics: Loaded<Metrics>; previews: Preview[]; assets: SlotAssets | null };

const hookOf = (variantId: string) => variantId.split("_")[0];

function groupByHook<T>(items: T[], idOf: (t: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const h = hookOf(idOf(item));
    groups.set(h, [...(groups.get(h) ?? []), item]);
  }
  return [...groups.entries()];
}

function durationLabel(row: MetricsRow | undefined) {
  const sec = row ? cellNumber(row.duration_sec) : null;
  return sec === null ? null : `${sec.toFixed(1)} s`;
}

function HookGroup({ hook, assets, children }: { hook: string; assets: SlotAssets | null; children: ReactNode }) {
  const line = assets?.slots[hook]?.onScreen;
  return (
    <div>
      <p className="mb-2.5 flex items-baseline gap-2">
        <span className="font-mono text-[13px] font-semibold text-accent">{hook}</span>
        {line ? <span className="text-[12px] font-extrabold uppercase text-text">{line}</span> : null}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </div>
  );
}

/** Rendered MP4 previews, or (before `npm run previews`) cards that open the variant in the live Player. */
function Gallery({ metrics, previews, assets }: Props) {
  const rows = metrics.kind === "ok" ? metrics.data.rows : [];
  const rowOf = (id: string) => rows.find((r) => r.variant_id === id);
  const openable = (id: string) => assets !== null && parseVariantId(id, assets) !== null;

  if (previews.length > 0) {
    return (
      <div className="grid gap-8 xl:grid-cols-2 xl:gap-x-10">
        {groupByHook(previews, (p) => p.variantId).map(([hook, items]) => (
          <HookGroup key={hook} hook={hook} assets={assets}>
            {items.map((p) => (
              <PreviewCard key={p.variantId} preview={p} meta={durationLabel(rowOf(p.variantId))} openable={openable(p.variantId)} />
            ))}
          </HookGroup>
        ))}
      </div>
    );
  }

  const rendered = rows.filter((r) => r.status === "ok");
  if (rendered.length === 0) {
    return (
      <InputNotice tone="neutral" title="No previews yet">
        Previews are made from rendered MP4s: run <code>npm run render</code>, then <code>npm run previews</code>, and rebuild. Every
        variant already plays live in the Player above.
      </InputNotice>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        Preview files not generated yet (<code className="font-mono text-text">npm run previews</code>); each rendered variant opens in the
        live Player instead.
      </p>
      <div className="grid gap-8 xl:grid-cols-2 xl:gap-x-10">
        {groupByHook(rendered, (r) => r.variant_id).map(([hook, items]) => (
          <HookGroup key={hook} hook={hook} assets={assets}>
            {items.map((r) => (
              <div key={r.variant_id} className="flex min-w-0 flex-col rounded-md border border-dashed border-line-strong p-2.5">
                <span className="truncate font-mono text-[11.5px] text-text">{r.variant_id}</span>
                <span className="font-mono text-[11px] text-muted">{durationLabel(r)}</span>
                {openable(r.variant_id) ? <OpenInPlayer id={r.variant_id} /> : <span className="mt-2 text-[11px] text-warn">not in current pack</span>}
              </div>
            ))}
          </HookGroup>
        ))}
      </div>
    </div>
  );
}

export function RenderedSection(props: Props) {
  const { metrics } = props;
  const m = metrics.kind === "ok" ? metrics.data : null;

  return (
    <section id="rendered" aria-labelledby="rendered-title" className="border-t border-line">
      <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeader
          id="rendered"
          index="04"
          kicker="Rendered"
          title="Batch-rendered, then measured."
          lede="@remotion/renderer bundles once, then renders every manifest to H.264 MP4. A manifest that fails preflight is skipped with its reason instead of stopping the batch."
          aside={
            m ? (
              <>
                <span className="font-mono text-[11px] text-muted">generated {fmtStamp(m.generatedAt)}</span>
                <a
                  href="/metrics.json"
                  download
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-3.5 text-[13px] text-text transition-colors duration-150 hover:border-accent/60"
                >
                  <DownloadIcon size={15} />
                  <span className="font-mono">metrics.json</span>
                </a>
              </>
            ) : null
          }
        />
        {metrics.kind === "ok" ? (
          <MetricTiles m={metrics.data} />
        ) : (
          <LoadNotice
            result={metrics}
            missingTitle={
              <>
                Batch not rendered yet — run <code className="font-mono">npm run render</code>
              </>
            }
            howTo="The batch render writes it next to the MP4s; rebuild the site afterwards."
          />
        )}

        <div className="mt-12">
          <h3 className="eyebrow mb-4 text-text">Previews · 540×960</h3>
          <Gallery {...props} />
        </div>

        {m ? (
          <div className="mt-12">
            <h3 className="eyebrow mb-4 text-text">Per-variant results</h3>
            <RenderTable rows={m.rows} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

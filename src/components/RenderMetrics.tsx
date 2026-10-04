import type { ReactNode } from "react";
import type { Metrics, MetricsRow } from "./data";
import { cellNumber, DASH, fmtInt, fmtSec } from "./format";

function Tile({ label, value, unit, note, lead = false }: { label: string; value: string; unit?: string; note: ReactNode; lead?: boolean }) {
  return (
    <div className={`flex flex-col gap-2 bg-surface p-4 lg:p-5 ${lead ? "col-span-2 lg:row-span-2 lg:justify-between" : ""}`}>
      <dt className="eyebrow">{label}</dt>
      <dd className="flex flex-col gap-1.5">
        <span className="flex items-baseline gap-1.5">
          <span className={`font-mono font-semibold tracking-tight ${lead ? "text-[clamp(40px,6vw,64px)] leading-none text-accent" : "text-[22px] text-text"}`}>{value}</span>
          {unit ? <span className="font-mono text-[12px] text-muted">{unit}</span> : null}
        </span>
        <span className="text-[12px] leading-snug text-muted">{note}</span>
      </dd>
    </div>
  );
}

export function MetricTiles({ m }: { m: Metrics }) {
  const notOk = [m.skipped ? `${m.skipped} skipped` : "", m.failed ? `${m.failed} failed` : ""].filter(Boolean).join(" · ");
  const codec = [m.settings.codec, m.settings.crf !== undefined ? `crf ${m.settings.crf}` : ""].filter(Boolean).join(" ");
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
      <Tile
        lead
        label="Throughput, this machine"
        value={m.videosPerHour === null ? DASH : `≈${fmtInt(m.videosPerHour)}`}
        unit="videos / hour"
        note={`${m.rendered} videos in ${m.wallSec.toFixed(0)} s wall time, plus a one-time ${m.bundleSec.toFixed(1)} s bundle. Extrapolated from this batch, not a benchmark.`}
      />
      <Tile label="Rendered" value={`${m.rendered}/${m.rows.length}`} note={notOk || "every manifest passed preflight"} />
      <Tile label="Avg render" value={fmtSec(m.avgRenderSec)} unit="/ video" note={`min ${fmtSec(m.minRenderSec)} · max ${fmtSec(m.maxRenderSec)}`} />
      <Tile label="Machine" value={`${m.machine.cores} threads`} note={`${m.machine.cpu} · ${m.machine.ramGb} GB · ${m.machine.os} · Node ${m.machine.node}`} />
      <Tile
        label="Concurrency"
        value={`${m.settings.concurrency}×${m.settings.parallel}`}
        unit="frames × videos"
        note={[codec, `peak Node RSS ${fmtInt(m.peakRssMb)} MB (excl. Chrome)`].filter(Boolean).join(" · ")}
      />
    </dl>
  );
}

const STATUS_TONE: Record<MetricsRow["status"], string> = { ok: "text-ok", skipped: "text-warn", failed: "text-bad" };
const AD_COLS = ["spend", "ctr", "hook_rate_3s", "hold_rate"] as const;
const RENDER_COLS = ["variant_id", "hook", "body", "cta", "duration_sec", "render_sec", "status"] as const;

const num = (cell: string) => {
  const n = cellNumber(cell);
  return n === null ? DASH : n.toFixed(2);
};

function Row({ r }: { r: MetricsRow }) {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-surface-2/70">
      <th scope="row" className="px-3 py-2 text-left font-semibold whitespace-nowrap text-text">
        {r.variant_id}
      </th>
      <td className="px-3 py-2 text-muted">{r.hook_id || DASH}</td>
      <td className="px-3 py-2 text-muted">{r.body_id || DASH}</td>
      <td className="px-3 py-2 text-muted">{r.cta_id || DASH}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text">{num(r.duration_sec)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text">{num(r.render_sec)}</td>
      <td className="px-3 py-2">
        <span className={STATUS_TONE[r.status]}>{r.status}</span>
        {r.reason ? (
          <span className="block max-w-[32ch] truncate text-[11px] text-muted" title={r.reason}>
            {r.reason}
          </span>
        ) : null}
      </td>
      {AD_COLS.map((c, i) => (
        <td key={c} className={`px-3 py-2 text-right tabular-nums ${r[c] ? "text-text" : "text-muted"} ${i === 0 ? "border-l border-line" : ""}`}>
          {r[c] || DASH}
        </td>
      ))}
    </tr>
  );
}

export function RenderTable({ rows }: { rows: MetricsRow[] }) {
  return (
    <section aria-labelledby="render-table-caption" tabIndex={0} className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[960px] border-collapse font-mono text-[12.5px]">
        <caption id="render-table-caption" className="sr-only">
          Batch render result per variant. Ad metric columns stay empty until joined from a platform export on variant_id.
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="colgroup" colSpan={RENDER_COLS.length} className="px-3 pt-3 pb-2 text-left">
              <span className="eyebrow">Render · this machine</span>
            </th>
            <th scope="colgroup" colSpan={AD_COLS.length} className="border-l border-line px-3 pt-3 pb-2 text-left font-sans">
              <span className="eyebrow text-text">Ad metrics</span>{" "}
              <span className="text-[11px] text-muted">joined from Meta/TikTok export on variant_id</span>
            </th>
          </tr>
          <tr className="border-b border-line text-[11px] text-muted">
            {RENDER_COLS.map((c) => (
              <th key={c} scope="col" className={`px-3 py-2 font-semibold ${c.endsWith("_sec") ? "text-right" : "text-left"}`}>
                {c}
              </th>
            ))}
            {AD_COLS.map((c, i) => (
              <th key={c} scope="col" className={`px-3 py-2 text-right font-semibold ${i === 0 ? "border-l border-line" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.variant_id} r={r} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

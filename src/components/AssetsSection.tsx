import type { SlotAssets } from "../contract";
import { AudioButton, ClampText, ClipThumb, ImageThumb } from "./AssetMedia";
import { LoadNotice, ProvenanceBadge, SectionHeader } from "./chrome";
import type { Loaded } from "./data";
import { assetBins, type AssetBin, type AssetItem } from "./pack";

const BIN_META: Record<AssetBin, { title: string; note: string }> = {
  hooks: { title: "Hooks", note: "First 3 s: clip, voice line, on-screen text" },
  bodies: { title: "Bodies", note: "Two clips per body, cut on a word boundary" },
  ctas: { title: "CTA", note: "End-card voice lines" },
  brand: { title: "Brand", note: "Packshot for the end card" },
  music: { title: "Music", note: "Beds, ducked under every spoken word" },
  sfx: { title: "SFX", note: "Cut whoosh, end-card pop" },
  other: { title: "Other", note: "Pack files outside the standard bins" },
};

const KIND_RANK = { video: 0, image: 1, audio: 2 } as const;
const rank = (i: AssetItem) => (i.kind ? KIND_RANK[i.kind] : 3);

function Visual({ item }: { item: AssetItem }) {
  if (!item.src) {
    return (
      <span className="flex aspect-[9/16] w-full items-center justify-center rounded-sm border border-dashed border-bad/50 p-1 text-center text-[10px] leading-tight text-bad">
        not in public/
      </span>
    );
  }
  if (item.kind === "audio") return <AudioButton path={item.src} name={item.name} />;
  if (item.kind === "image") return <ImageThumb path={item.src} name={item.name} />;
  return <ClipThumb path={item.src} name={item.name} />;
}

function AssetCard({ item }: { item: AssetItem }) {
  const p = item.provenance;
  const audio = item.kind === "audio";
  const voiceLine = audio ? (p?.text ?? item.scene?.text) : undefined;
  const onScreen = item.kind === "video" && item.scene?.slot === "hook" ? item.scene.onScreen : undefined;
  const origin = p ? [p.tool, p.model, p.created].filter(Boolean).join(" · ") : "provenance not recorded";

  return (
    <li className="flex gap-3 rounded-md border border-line bg-surface p-2.5">
      <div className={audio && item.src ? "shrink-0" : "w-[68px] shrink-0"}>
        <Visual item={item} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-[13px] text-text">{item.name}</span>
          {item.scene ? <span className="font-mono text-[11px] text-accent">{item.scene.id}</span> : null}
          {item.durationSec !== null ? <span className="font-mono text-[11px] text-muted">{item.durationSec.toFixed(1)} s</span> : null}
          {item.label ? <span className="text-[11px] text-muted">{item.label}</span> : null}
        </p>
        {onScreen ? <p className="text-[12px] font-extrabold uppercase leading-snug text-text">{onScreen}</p> : null}
        {voiceLine ? <p className="text-[12.5px] leading-snug text-text/90">“{voiceLine}”</p> : null}
        <p className={`font-mono text-[11px] ${p ? "text-muted" : "text-warn"}`}>{origin}</p>
        {p?.prompt ? <ClampText text={p.prompt} label="prompt" /> : null}
      </div>
    </li>
  );
}

function Bins({ assets }: { assets: SlotAssets }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {assetBins(assets).map(({ bin, items }) => (
        <div key={bin} className="grid gap-4 py-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
          <div>
            <h3 className="eyebrow text-text">{BIN_META[bin].title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{BIN_META[bin].note}</p>
            <p className="mt-1 font-mono text-[11px] text-muted">{items.length} files</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {[...items].sort((a, b) => rank(a) - rank(b)).map((item) => (
              <AssetCard key={item.key} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AssetsSection({ assets }: { assets: Loaded<SlotAssets> }) {
  const pack = assets.kind === "ok" ? assets.data : null;
  const synthetic = pack?.pack.provenance === "synthetic";

  return (
    <section id="assets" aria-labelledby="assets-title" className="border-t border-line bg-surface/40">
      <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeader
          id="assets"
          index="03"
          kicker="AI assets"
          title="The engine's job is the montage."
          lede={
            synthetic
              ? "This build runs on a synthetic pack: procedural placeholder clips and music plus an offline system voice, laid out in the same file tree as the AI pack (docs/ASSET_PACK.md), so the real pack replaces it by re-running ingest."
              : "Generated before the demo in third-party AI tools. Every file keeps the tool, model, prompt and date it came from; nothing is generated at runtime."
          }
          aside={pack ? <ProvenanceBadge provenance={pack.pack.provenance} /> : null}
        />
        {assets.kind === "ok" ? (
          <Bins assets={assets.data} />
        ) : (
          <LoadNotice
            result={assets}
            missingTitle="No asset pack ingested yet"
            howTo={
              <>
                Run <code>npm run make:pack</code> then <code>npm run ingest</code>, and rebuild.
              </>
            }
          />
        )}
      </div>
    </section>
  );
}

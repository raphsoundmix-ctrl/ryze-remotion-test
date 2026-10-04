import type { SlotAssets } from "../contract";
import { InputNotice, LoadNotice, SectionHeader } from "./chrome";
import type { Loaded } from "./data";
import { Playground } from "./Playground";
import { initialSelection } from "./selection";

function Body({ assets }: { assets: Loaded<SlotAssets> }) {
  if (assets.kind !== "ok") {
    return (
      <LoadNotice
        result={assets}
        missingTitle="The Playground needs an ingested pack"
        howTo={
          <>
            Run <code>npm run make:pack</code> then <code>npm run ingest</code>, and rebuild.
          </>
        }
      />
    );
  }
  const initial = initialSelection(assets.data);
  if (!initial) {
    return (
      <InputNotice tone="bad" title="The pack has no complete hook / body / CTA set">
        <code>data/slot-assets.json</code> needs at least one slot of each kind to compose a variant.
      </InputNotice>
    );
  }
  return <Playground assets={assets.data} initial={initial} />;
}

export function PlaygroundSection({ assets }: { assets: Loaded<SlotAssets> }) {
  return (
    <section id="playground" aria-labelledby="playground-title">
      <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeader
          id="playground"
          index="02"
          kicker="Playground"
          title="Recombine it yourself."
          lede="Every click recomposes the manifest in memory and the Player re-renders it on the spot. No server, no render queue, and once the pack is cached, no network."
        />
        <Body assets={assets} />
      </div>
    </section>
  );
}

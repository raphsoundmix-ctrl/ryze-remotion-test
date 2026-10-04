import { AssetsSection } from "../src/components/AssetsSection";
import { TopBar } from "../src/components/chrome";
import { Footer } from "../src/components/Footer";
import { Hero } from "../src/components/Hero";
import { PackMediaProvider } from "../src/components/PackMedia";
import { packMediaPaths } from "../src/components/pack";
import { PlaygroundSection } from "../src/components/PlaygroundSection";
import { RenderedSection } from "../src/components/RenderedSection";
import { loadPageData } from "./load-data";

export default function Page() {
  const { assets, metrics, previews } = loadPageData();
  const pack = assets.kind === "ok" ? assets.data : null;

  const sections = (
    <>
      <PlaygroundSection assets={assets} />
      <AssetsSection assets={assets} />
      <RenderedSection metrics={metrics} previews={previews} assets={pack} />
    </>
  );

  return (
    <>
      <a
        href="#playground"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to playground
      </a>
      <TopBar />
      <main>
        <Hero assets={assets} metrics={metrics} />
        {pack ? <PackMediaProvider paths={packMediaPaths(pack)}>{sections}</PackMediaProvider> : sections}
      </main>
      <Footer provenance={pack?.pack.provenance ?? null} />
    </>
  );
}

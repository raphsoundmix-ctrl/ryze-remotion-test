import type { ReactNode } from "react";
import { VERSION as REMOTION_VERSION } from "remotion/version";
import type { Provenance } from "../contract";
import { Mark } from "./chrome";
import { GitHubIcon } from "./icons";
import { REMOTION_LICENSE_URL, REPO_URL } from "./site";

const ASSETS_NOTE: Record<Provenance | "none", string> = {
  synthetic:
    "This build uses a synthetic pack: procedural placeholder clips and music plus an offline system voice, labelled on every rendered frame.",
  "pre-generated":
    "Footage, voice and music were generated before the demo in third-party AI tools (listed per file above). Nothing is generated at runtime.",
  none: "No asset pack was ingested when this page was built.",
};

function NoteList({ title, items }: { title: string; items: ReactNode[] }) {
  return (
    <div>
      <h2 className="eyebrow text-text">{title}</h2>
      <ul className="mt-4 flex flex-col gap-3 text-[13px] leading-relaxed text-muted">
        {items.map((item, i) => (
          <li key={i} className="border-l border-line pl-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer({ provenance }: { provenance: Provenance | null }) {
  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr_1fr] lg:gap-14">
        <div>
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[15px] font-black tracking-[-0.01em]">NORDA Ad Engine</span>
          </div>
          <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed text-muted">
            Remotion auto-montage prototype.
            <br />
            Test task · Video Editor (Remotion).
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3.5 text-[13px] text-text transition-colors duration-150 hover:border-accent/60"
          >
            <GitHubIcon size={16} />
            Source on GitHub
          </a>
        </div>
        <NoteList
          title="How it's built"
          items={[
            <>
              <span className="text-text">Remotion {REMOTION_VERSION}</span>: one <code className="font-mono">AdVariant</code> composition,
              hook → body → CTA with transitions, word-synced captions and a ducked music bed. Length is computed from the manifest.
            </>,
            <>
              <span className="text-text">zod contract v2</span>: the slot pack and every manifest validate against{" "}
              <code className="font-mono">src/contract.ts</code>.
            </>,
            <>
              <span className="text-text">Next 16 static page</span>: data is read at build time; no API routes, no runtime AI calls, no
              external fonts or CDNs.
            </>,
            <>
              <span className="text-text">Preview vs render</span>: <code className="font-mono">@remotion/player</code> in the browser,{" "}
              <code className="font-mono">@remotion/renderer</code> for the batch.
            </>,
          ]}
        />
        <NoteList
          title="Honesty notes"
          items={[
            ASSETS_NOTE[provenance ?? "none"],
            "NORDA is a fictional brand; every product claim is demo copy.",
            "Independent prototype for a hiring test task; not affiliated with or endorsed by Ryze.",
            "Render times come from one machine (see Rendered) and change with hardware.",
            <>
              Remotion is free for individuals and companies of up to 3 people; larger for-profit teams need a{" "}
              <a href={REMOTION_LICENSE_URL} target="_blank" rel="noreferrer" className="text-text underline decoration-line-strong underline-offset-4 hover:decoration-accent">
                Company License
              </a>
              .
            </>,
          ]}
        />
      </div>
    </footer>
  );
}

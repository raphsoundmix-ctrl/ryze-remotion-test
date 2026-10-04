import type { ReactNode } from "react";
import type { Provenance } from "../contract";
import type { Loaded } from "./data";
import { GitHubIcon } from "./icons";
import { REPO_URL, SECTIONS } from "./site";

/** Three slot bars (hook | body | CTA): the product mark, also used as app/icon.svg. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <rect x="7" y="9" width="4.5" height="14" rx="1.5" fill="var(--on-accent)" />
      <rect x="13.75" y="6" width="4.5" height="20" rx="1.5" fill="var(--on-accent)" />
      <rect x="20.5" y="12" width="4.5" height="8" rx="1.5" fill="var(--on-accent)" />
    </svg>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 h-[var(--header-h)] border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1240px] items-center gap-1 px-4 sm:px-6">
        <a href="#top" className="mr-auto flex min-h-11 items-center gap-2.5 rounded-sm">
          <Mark />
          <span className="text-[14px] font-black tracking-[-0.01em]">NORDA</span>
          <span className="hidden text-[13px] text-muted sm:inline">Ad Engine</span>
        </a>
        <nav aria-label="Sections">
          <ul className="flex items-center">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-11 items-center rounded-sm px-2 text-[13px] text-muted transition-colors duration-150 hover:text-text sm:px-3"
                >
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source code on GitHub"
          className="inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
        >
          <GitHubIcon />
        </a>
      </div>
    </header>
  );
}

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const synthetic = provenance === "synthetic";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${
        synthetic ? "border-warn/40 bg-warn/10 text-warn" : "border-line-strong bg-surface-2 text-text"
      }`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {synthetic ? "Synthetic pack — procedural placeholders" : "Pre-generated offline — AI assets made before the demo"}
    </span>
  );
}

export function SectionHeader({
  id,
  index,
  kicker,
  title,
  lede,
  aside,
}: {
  id: string;
  index: string;
  kicker: string;
  title: ReactNode;
  lede: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="mb-8 grid gap-4 lg:mb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p className="eyebrow">
          <span className="font-mono text-accent">{index}</span> · {kicker}
        </p>
        <h2 id={`${id}-title`} className="mt-3 text-[clamp(28px,4.2vw,46px)] font-black leading-[1.02] tracking-[-0.03em]">
          {title}
        </h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-muted">{lede}</p>
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </header>
  );
}

type NotOk = Extract<Loaded<unknown>, { kind: "missing" | "invalid" }>;

/** Missing input -> what to run; invalid input -> the validation problem verbatim. Never an empty panel. */
export function LoadNotice({ result, missingTitle, howTo }: { result: NotOk; missingTitle: ReactNode; howTo: ReactNode }) {
  if (result.kind === "missing") {
    return (
      <InputNotice tone="warn" title={missingTitle}>
        Expected <code>{result.path}</code>. {howTo}
      </InputNotice>
    );
  }
  return (
    <InputNotice tone="bad" title={`${result.path} failed validation`}>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[12px] text-bad">{result.problem}</pre>
    </InputNotice>
  );
}

/** Explicit state for a missing or invalid build-time input: says what is absent and which command produces it. */
export function InputNotice({ tone, title, children }: { tone: "warn" | "bad" | "neutral"; title: ReactNode; children: ReactNode }) {
  const border = { warn: "border-warn/40", bad: "border-bad/50", neutral: "border-line-strong" }[tone];
  const text = { warn: "text-warn", bad: "text-bad", neutral: "text-text" }[tone];
  return (
    <div className={`rounded-lg border border-dashed ${border} bg-surface px-5 py-6`}>
      <p className={`text-[15px] font-extrabold ${text}`}>{title}</p>
      <div className="mt-2 text-[13px] leading-relaxed text-muted [&_code]:rounded-sm [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-text">
        {children}
      </div>
    </div>
  );
}

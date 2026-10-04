"use client";

import { useId, type ReactNode } from "react";

export type AxisOption<T extends string> = {
  value: T;
  label: string;
  sub?: string;
  /** Leading visual (swatch, aspect glyph). Decorative only. */
  lead?: ReactNode;
  tone?: "accent" | "ice";
  /** Ids (H1, M2, 9:16) are set in mono; words (Hormozi, Off) in the UI face. */
  mono?: boolean;
};

type Props<T extends string> = {
  label: string;
  meta?: string;
  options: AxisOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Stack options on narrow screens when sublabels carry real text (hook lines). */
  stackOnMobile?: boolean;
};

const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };
const SM_COLS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

const PRESSED_TONE = {
  accent: "border-accent/70 bg-accent/[0.08] text-text",
  ice: "border-ice/70 bg-ice/[0.08] text-text",
} as const;

const ID_TONE = { accent: "text-accent", ice: "text-ice" } as const;

/** Segmented single-choice control: a labelled group of toggle buttons (aria-pressed), one pressed at a time. */
export function AxisControl<T extends string>({ label, meta, options, value, onChange, stackOnMobile = false }: Props<T>) {
  const labelId = useId();
  const n = Math.min(4, options.length);
  const cols = stackOnMobile ? `grid-cols-1 ${SM_COLS[n]}` : COLS[n];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span id={labelId} className="eyebrow">
          {label}
        </span>
        {meta ? <span className="font-mono text-[11px] text-muted">{meta}</span> : null}
      </div>
      <div role="group" aria-labelledby={labelId} className={`grid gap-1.5 ${cols}`}>
        {options.map((o) => {
          const pressed = o.value === value;
          const tone = o.tone ?? "accent";
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(o.value)}
              className={`flex min-h-11 min-w-0 items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-[background-color,border-color,color] duration-150 ease-out active:translate-y-px ${
                pressed ? PRESSED_TONE[tone] : "border-line bg-surface text-muted hover:border-line-strong hover:bg-surface-2 hover:text-text"
              }`}
            >
              {o.lead ? <span className="mt-0.5 shrink-0">{o.lead}</span> : null}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={`text-[13px] leading-5 ${o.mono ? "font-mono font-semibold" : "font-extrabold"} ${pressed ? ID_TONE[tone] : "text-text"}`}
                >
                  {o.label}
                </span>
                {o.sub ? <span className="line-clamp-2 text-[12px] leading-snug text-muted">{o.sub}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

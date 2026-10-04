"use client";

import { useEffect, useState } from "react";
import type { SlotAssets } from "../contract";
import { enumerateVariants } from "../lib/variants";
import { fmtMs } from "./format";

/**
 * Times the real enumerateVariants() once in this browser (first, un-warmed run) for the pipeline strip.
 * Runs on the frame after hydration so the measurement is not inside React's commit.
 */
export function BuildTimer({ assets }: { assets: SlotAssets }) {
  const [run, setRun] = useState<{ count: number; ms: number } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const t0 = performance.now();
      const variants = enumerateVariants(assets);
      setRun({ count: variants.length, ms: performance.now() - t0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [assets]);

  return <span>{run ? `${run.count} built in ${fmtMs(run.ms)} client-side` : "timing in this browser…"}</span>;
}

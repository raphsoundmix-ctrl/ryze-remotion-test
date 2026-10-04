"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { prefetch, staticFile } from "remotion";

export type CacheFailure = { path: string; message: string };
export type CacheState = {
  status: "pending" | "done";
  settled: number;
  total: number;
  bytes: number;
  failed: CacheFailure[];
};

type PackMediaValue = { state: CacheState; urls: Readonly<Record<string, string>> };

const PackMediaContext = createContext<PackMediaValue | null>(null);

const IDLE_TIMEOUT_MS = 2000;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * After first paint + idle, pulls every pack file into memory with Remotion's `prefetch()` (blob URLs).
 * The Player resolves `staticFile()` sources through the same preload map, so switching variants
 * afterwards costs zero network requests. Failures are listed, not hidden: the Player then streams them.
 * `remotion` must be imported statically here: a lazy import("remotion") produced a preload map the
 * Player did not see (3 network requests on select, measured by scripts/ui-shots.ts).
 */
export function PackMediaProvider({ paths, children }: { paths: string[]; children: ReactNode }) {
  const [state, setState] = useState<CacheState>({
    status: paths.length ? "pending" : "done",
    settled: 0,
    total: paths.length,
    bytes: 0,
    failed: [],
  });
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    let handles: ReturnType<typeof prefetch>[] = [];
    const bytes = new Map<string, number>();

    const settle = (failure: CacheFailure | null) =>
      setState((s) => {
        const settled = s.settled + 1;
        return {
          status: settled >= s.total ? "done" : "pending",
          settled,
          total: s.total,
          bytes: [...bytes.values()].reduce((a, b) => a + b, 0),
          failed: failure ? [...s.failed, failure] : s.failed,
        };
      });

    const start = () => {
      handles = paths.map((p) =>
        prefetch(staticFile(p), { method: "blob-url", onProgress: ({ loadedBytes }) => bytes.set(p, loadedBytes) }),
      );
      handles.forEach((h, i) => {
        const path = paths[i];
        h.waitUntilDone().then(
          (url) => {
            if (cancelled) return;
            setUrls((u) => ({ ...u, [path]: url }));
            settle(null);
          },
          (err: unknown) => {
            if (!cancelled) settle({ path, message: messageOf(err) });
          },
        );
      });
    };

    const hasIdle = typeof window.requestIdleCallback === "function";
    const idleId = hasIdle ? window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS }) : null;
    const timerId = hasIdle ? null : window.setTimeout(start, 0);

    return () => {
      cancelled = true;
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
      for (const h of handles) h.free();
    };
  }, [paths]);

  const value = useMemo(() => ({ state, urls }), [state, urls]);
  return <PackMediaContext.Provider value={value}>{children}</PackMediaContext.Provider>;
}

function usePackMedia(): PackMediaValue {
  const ctx = useContext(PackMediaContext);
  if (!ctx) throw new Error("usePackMedia must be used inside <PackMediaProvider>");
  return ctx;
}

export const useCacheState = () => usePackMedia().state;

/** In-memory blob URL once cached; until then the regular public URL. */
export function useMediaSrc(path: string): string {
  const { urls } = usePackMedia();
  return urls[path] ?? staticFile(path);
}

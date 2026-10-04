/** Display formatting for measured values. Absent values render as an em dash, never as 0. */
export const DASH = "—";

/** metrics.json cells are strings; "" means "not measured" (skipped row, ad metrics not joined yet). */
export function cellNumber(cell: string): number | null {
  if (cell.trim() === "") return null;
  const n = Number(cell);
  return Number.isFinite(n) ? n : null;
}

export const fmtSec = (n: number | null, digits = 1) => (n === null ? DASH : `${n.toFixed(digits)} s`);

export const fmtMs = (ms: number) => `${ms < 10 ? ms.toFixed(2) : ms.toFixed(0)} ms`;

export const fmtMb = (bytes: number) => `${(bytes / 2 ** 20).toFixed(1)} MB`;

export const fmtInt = (n: number) => n.toLocaleString("en-US");

/** ISO timestamp -> "2026-10-04 22:45 UTC"; deterministic on server and client (no locale/timezone drift). */
export const fmtStamp = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

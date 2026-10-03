# Ryze Video Engine: rules for Claude Code

Stack: Next 16, Remotion **4.0.532 (pin exact; every @remotion/* same version)**, zod 4.5.4, TypeScript 7 (needs `"types":["node"]`), tsx.
Gate: `npm run verify` (= `tsc --noEmit && tsx scripts/verify.tsx`). Other: `dev | seed | generate | render`.
Work plan: `PLAN.md`. Read ONLY the section of the current phase.

## Rules
1. **Token economy.** No exploring. Touch only files named in the phase. Never read `node_modules/ .next/ out/ package-lock.json`. Use grep or `view_range`. Edit with diffs; do not rewrite files >100 lines.
2. **Gate.** Every phase ends with `npm run verify` green, then `git commit -m "P<n>: ..."`. Same failure twice → STOP and report. Do not loop.
3. **Secrets.** Only `.env.local`. Never print, log, commit or put a key in client code. Keys in `.env.example` stay empty.
4. **Offline asset pack.** The demo makes NO runtime AI/API calls. Inputs come from the asset pack (docs/ASSET_PACK.md). Paid/live adapters are documentation only.
5. **Node-only code** (`src/providers/**`, `src/lib/assets.ts`, anything using fs/network) must never be imported from `src/remotion/**` or `src/components/**`.
6. **Remotion.** Local assets via `staticFile()`; remote via URL. Use `Html5Audio`, `OffthreadVideo`, `Loop` from `"remotion"`. Do not use `getAudioDurationInSeconds` (deprecated). Duration comes from the manifest (`src/lib/timing.ts`).
7. **Claims need measurements.** Numbers in README/email come only from `out/manifest.csv` or verify output. Label non-trivial claims `[CONFIRMED] [INFERENCE] [ASSUMPTION] [EXPERIMENT]`.
8. **Windows-safe.** No bash-only syntax in npm scripts. Quote paths.
9. **Sandbox limit.** Chrome Headless Shell downloads from `remotion.media`. If blocked, do not retry: rendering happens on the user's machine only.
10. **Report format after each phase (max 10 lines):** changed files; last line of `npm run verify`; open risks; next phase.

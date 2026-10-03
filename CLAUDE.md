# Ryze Video Engine: rules (auto-loaded every session)

Model: Opus 5.5. First action of every session: read `docs/RUNBOOK.md` fully, then `docs/STATUS.md`. Autopilot: `/autopilot REPO_URL=...`; `/status`, `/phase Pn`, `/pause`.
Stack: Next 16, Remotion **4.0.532** (all `@remotion/*` exact), zod **4.5.4** exact, TypeScript 7 (`"types":["node"]`), tsx. Scripts in Node, no bashisms. Never `cd` out of the repo root.
Commands: `npm run verify` (gate) | `hooks:test` | `doctor` | `dev` | `build`. Defined by the phases: `make:pack ingest build:variants render qa:stills previews ui:shots`.

## Rules
1. **Autonomy:** you are the orchestrator. Delegate to the 8 subagents in `.claude/agents/` with complete briefs (goal, files, acceptance command, constraints, return format <= 12 lines). <= 3 in parallel, disjoint file ownership (RUNBOOK §4, §6).
2. **Loop:** plan, delegate, integrate, `npm run verify`, adversarial-reviewer, visual-qa (if visuals changed), commit, record in STATUS.md. Stop only at `RUN_STATE: DONE` or a user-owned blocker (RUNBOOK §10). Do not stop to summarize or ask permission.
3. **Gate:** every phase ends with verify green and a commit: `git add <paths>` then `git commit` as SEPARATE commands. Same failure twice: change approach. 3 rounds max per finding, then log KNOWN_ISSUE.
4. **No runtime AI/API calls, no secrets.** Offline asset pack only. Never write `.env*` (except `.env.example`, empty values). Never touch `.claude/settings.json` or `.claude/hooks/` (user-owned).
5. **Honesty:** synthetic assets are labeled synthetic. No claim without a measurement (FINAL_INSTRUCTIONS §15). Labels: [CONFIRMED] [INFERENCE] [ASSUMPTION] [EXPERIMENT].
6. **Token economy:** do not read `node_modules/ .next/ out/ package-lock.json`. Delegate log-heavy work (render, ingest) to subagents; keep only their summaries. Grep or `view_range`, diffs not rewrites.
7. **Remotion:** local assets via `staticFile()`; `Loop` for short clips; durations from the manifest; no network at render; node-only code never imported from `src/remotion/**` or `src/components/**`.
8. Chrome download host may be blocked: use `REMOTION_BROWSER_EXECUTABLE` / `--browser`.

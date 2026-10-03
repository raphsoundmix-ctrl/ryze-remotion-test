---
description: Start or resume the autonomous build per docs/RUNBOOK.md (Stop-gate keeps it running until RUN_STATE DONE or a user-owned blocker)
argument-hint: REPO_URL=https://github.com/<user>/<repo> [VERCEL_PROJECT=ryze-video-engine] [BRAND=NORDA] [MAX_BLOCKS=30]
---
AUTOPILOT. Arguments: $ARGUMENTS

1. Read CLAUDE.md, docs/RUNBOOK.md (fully) and docs/STATUS.md.
2. Create or refresh `.claude/state/autopilot` as JSON `{"blocks":0,"max":<MAX_BLOCKS or 30>}` (keep an existing `blocks` value on resume). Store the parsed arguments in docs/STATUS.md under `PARAMS`.
3. Delete docs/BLOCKER.md if the user has resolved it (the blocker text tells you what to re-check).
4. Run `npm run doctor`, `npm run hooks:test`, `npm run verify`. Record one line each in docs/STATUS.md.
5. Run the phase loop from RUNBOOK §5 until STATUS.md contains `RUN_STATE: DONE`, or you hit a USER-OWNED blocker (RUNBOOK §10: write docs/BLOCKER.md, then stop).
6. Delegate per RUNBOOK §4 and §6. Never more than 3 subagents in parallel. Never edit `.claude/settings.json` or `.claude/hooks/`.

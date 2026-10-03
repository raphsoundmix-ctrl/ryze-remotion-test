// Stop hook: while autopilot is ON, refuse to stop until docs/STATUS.md says RUN_STATE: DONE
// or docs/BLOCKER.md exists (user-owned blocker). Bounded by a block counter to avoid runaway loops/quota burn.
// Autopilot is ON only if .claude/state/autopilot exists (created by /autopilot, removed by /pause).
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const flagPath = `${dir}/.claude/state/autopilot`;
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
try { readFileSync(0, "utf8"); } catch { /* stdin not needed */ }

if (!existsSync(flagPath)) process.exit(0);

let flag = { blocks: 0, max: 30 };
try { flag = { ...flag, ...JSON.parse(read(flagPath)) }; } catch { /* keep defaults */ }

const blocker = read(`${dir}/docs/BLOCKER.md`).trim();
if (blocker) process.exit(0); // waiting for the user: let Claude stop and show the blocker

if (/^RUN_STATE:\s*DONE\b/m.test(read(`${dir}/docs/STATUS.md`))) {
  try { unlinkSync(flagPath); } catch { /* ignore */ }
  process.exit(0);
}

if (flag.blocks >= flag.max) {
  console.error(`[stop-gate] block limit (${flag.max}) reached: allowing stop. Re-run /autopilot to continue.`);
  try { unlinkSync(flagPath); } catch { /* ignore */ }
  process.exit(0);
}

flag.blocks += 1;
try { writeFileSync(flagPath, JSON.stringify(flag)); } catch { /* ignore */ }
console.error(
  `[stop-gate ${flag.blocks}/${flag.max}] Autopilot is ON: docs/STATUS.md is not "RUN_STATE: DONE" and there is no docs/BLOCKER.md. ` +
  `Continue with the next unfinished phase in docs/STATUS.md (RUNBOOK §5 loop). ` +
  `If you are blocked by something ONLY the user can do, write docs/BLOCKER.md (RUNBOOK §10 format) and stop. ` +
  `Do not stop to summarize or ask for confirmation.`,
);
process.exit(2);

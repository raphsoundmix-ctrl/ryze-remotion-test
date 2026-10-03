---
disable-model-invocation: true
description: Run exactly one phase from docs/RUNBOOK.md through the full loop (build, verify, review, QA, commit)
argument-hint: <phase id, e.g. P3>
---
Run phase $ARGUMENTS only. Follow RUNBOOK §5 (loop) and the phase's section in §7. Update docs/STATUS.md. Do not start the next phase.

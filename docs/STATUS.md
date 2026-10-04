# STATUS (orchestrator-maintained; the Stop-gate reads the RUN_STATE line)

RUN_STATE: RUNNING
PARAMS: REPO_URL=https://github.com/raphsoundmix-ctrl/ryze-remotion-test VERCEL_PROJECT=ryze-video-engine BRAND=NORDA COMMIT_ASSETS=yes

| Phase | Owner | State | Commit | Evidence |
|---|---|---|---|---|
| P0 baseline | orchestrator | DONE | 0a66470 | verify 28/28 |
| P1.0 legacy sweep (v1 removed atomically) | orchestrator | DONE | 4e1a531 | live-AI path, schema v1, AIVideo deleted |
| P1 contract v2 + synthetic pack | orchestrator ∥ media | DONE | 4e1a531 | `src/contract.ts`, `npm run make:pack` idempotent |
| P2 ingest | media | DONE | 4e1a531 | INGEST_REPORT: 20 files OK, 0 FAIL, 4.58 MB |
| P3 template v2 | orchestrator | DONE | 4e1a531 | qa:stills 9x16/4x5/1x1 reviewed |
| P4a variants + preflight | orchestrator | DONE | 4e1a531 | 12 variants; 5x4x5=100 simulation |
| P4b batch render | orchestrator | DONE | 9ed7717 | 12/12 ok, avg 15.51 s, 188.4 s wall |
| P5 Playground UI | ui (interface-engineer) | DONE | 4e1a531 | build static; 0 network on select |
| P6 integration QA | orchestrator | DONE | 9ed7717 | frames from real MP4s (contact sheet, filmstrip) |
| P7 ship | orchestrator | DONE | 1432fcd | https://ryze-video-engine.vercel.app 200 |
| P8 proof pack | orchestrator | IN REVIEW | | README, LOOM_SCRIPT, EMAIL; adversarial review running |

Acceptance A1-A10 evidence:
- A1 `npm run verify` → ALL PASSED (148 checks)
- A2 `npm run ingest -- inbox/synthetic-pack` → data/slot-assets.json + docs/INGEST_REPORT.md (every file OK/FAIL with reason)
- A3 build:variants → 12 valid manifests; verify simulates 5x4x5 = 100 valid variants without code change
- A4 12 MP4 1080x1920 H.264+AAC 30 fps (ffprobe) + out/manifest.csv with render_sec, rss_mb, status, reason
- A5 batch with 1 corrupt manifest + 1 deleted asset → 2 rendered, 2 skipped with reasons, exit 0
- A6 `npm run ui:shots -- --url https://ryze-video-engine.vercel.app` → NETWORK_REQUESTS_ON_SELECT=0, CONSOLE_ERRORS=0
- A7 stills (3 formats, 2 styles) + frames from rendered MP4s reviewed; UI shots 360/768/1280 reviewed
- A8 staged-diff secret scan clean; .env.local / .vercel ignored; verify hygiene checks pass
- A9 Vercel prod 200, title "NORDA Ad Engine — Remotion auto-montage prototype"; repo PUBLIC, branch main
- A10 pending adversarial review

KNOWN_ISSUES:
- Pack is synthetic until the real asset pack lands in inbox/ (labeled SYNTHETIC in every frame and in the UI).
- Silence-path word timings are an estimate on fluent speech (up to ~260 ms vs SAPI word events); real packs should ship words.json/srt.
- Vercel project was linked before the app existed → preset "Other"; fixed by vercel.json `framework: nextjs`.
URLS: repo=https://github.com/raphsoundmix-ctrl/ryze-remotion-test | vercel=https://ryze-video-engine.vercel.app

LOG (append-only, one line per event):
- P0 baseline committed; harness (.claude/, hooks, doctor, hooks:test) added.
- 2026-10-04 single-session run: v1 removed, engine + pack + ingest + template + UI built (agents: media, interface-engineer), 12/12 rendered.
- 2026-10-05 pushed to GitHub main, Vercel project ryze-video-engine git-connected; preset fix redeployed; A6 on prod = 0.
- 2026-10-05 throughput experiment --parallel 3 --concurrency 8: 121.2 s wall for 12 (~356/h).

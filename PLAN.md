# PLAN.md v3: Ryze demo = offline AI asset pack → Remotion auto-montage → ≥10 variants

> RU кратко: генерацию делаем заранее (Kling/NanoBanana/ElevenLabs/Suno), движок делает автомонтаж 3×2×2 = 12 роликов.
> Это прямо то, что описано в вакансии: «templates that turn scripts, UGC footage, and AI assets into hundreds of short videos».
> Демо честно подписывает ассеты как pre-generated (провенанс из `pack.csv`). Никаких фейковых «generating…» без пометки «replay».
> Supersedes `docs/archive/PLAN_v2_providers.md`. Live AI adapters (Edge-TTS, Pexels, OpenRouter, fal) = documented upgrade path, not built.
> Product rules still from `docs/FINAL_INSTRUCTIONS.md` (claims audit §15, error matrix §10, metrics §12).

## 0. Why not fork `remotion-dev/remotion`
It is the framework monorepo (source of `remotion` + all `@remotion/*`, pnpm workspaces, Rust compositor). We already consume it as pinned npm packages (4.0.532). Reuse **from it**, do not fork it:
`@remotion/transitions` (TransitionSeries between slots) · `@remotion/captions` (word paging, TikTok-style) · `@remotion/media-parser` (preflight) · official skills repo `remotion-dev/skills` (best-practice rules for Claude Code).

## 1. Inputs → outputs

| Input (Raph, see docs/ASSET_PACK.md) | Engine output |
|---|---|
| 7 clips 9:16 5 s, 7 VO lines, packshot, 2 music, pack.csv | `data/slot-assets.json` (normalized, timed) |
| slots H1–H3, B1–B2, C1–C2 | 12 manifests `H{n}_B{n}_C{n}_{style}` (+ optional axes) |
| — | `out/*.mp4` ×12 + `out/manifest.csv` (render_sec, rss_mb) + demo UI |

Variant axes: **required** Hook×Body×CTA = 12. Optional: caption style ×2 → 24, music ×2 → 48, format 9:16/1:1/4:5 ×3 (Remotion `calculateMetadata` sets width/height).

## 2. Phases (each: verify green → commit)

| # | Phase | Key work | Done when |
|---|---|---|---|
| S0 | Asset pack (Raph) | Generate per ASSET_PACK.md, zip, upload | 18 required files + pack.csv |
| P1 | Contract v2 + synthetic pack | Schema per FINAL_INSTRUCTIONS §4 (style enum, `words[].word`, string ids, required `audioSrc/videoSrc`, `clipSec`); `scripts/make-synthetic-pack.ts` builds the SAME tree via ffmpeg (test clips + tone-burst "words" with gaps); `staticFile()` for local paths; first real still render of a real MP4 clip via OffthreadVideo | verify green; synthetic pack renders 1 still |
| P2 | Ingest | `npm run ingest -- <zip|dir>`: validate tree vs pack.csv; ffprobe each file (codec, dims, duration, audio); normalize video → 1080×1920 or 720×1280 H.264, strip audio; VO → trim lead silence, loudnorm −16 LUFS; timings: `*.words.json`/`*.srt` if present, else silence-aligned estimate (ffmpeg `silencedetect`, char-weighted); slot max (H≤4.0 s, B≤9.0 s, C≤3.5 s) → write `slot-assets.json` + ingest report | report lists every file OK/FAIL with reason; timings source per slot |
| P3 | Template v2 | Slot-based: TransitionSeries H→B→C (8-frame transitions; VO on its own timeline so transitions never cut speech); body auto-cut across B?a/B?b at the caption-chunk boundary nearest the midpoint; image clips get Ken Burns; captions via `@remotion/captions`, fix spacing bug (active scale × stroke > gap), safe zone ~65 % height; hook overlay from `onScreen`; CTA end card (packshot + brand + text, +1 s hold); music bed with auto-ducking under VO; whoosh on cuts; local font (no network at render) | stills at 5 key frames look right (human + my visual QA) |
| P4 | Variants | `src/lib/variants.ts` pure `composeManifest/enumerateVariants`; `npm run build:variants` → 12 manifests; verify: count = 12, 5×4×5 simulation = 100 with zero code change, all valid | 12 manifests valid |
| P5 | Render | per-file safeParse + media preflight; flags `--only --limit --concurrency --parallel --browser`; CSV `variant_id,hook_id,body_id,cta_id,file,duration_sec,render_sec,rss_mb,status,reason`; render 12 in sandbox (proof) | 12 MP4 + CSV; corrupt-one test skips only that item |
| P6 | Demo UI (static export) | 3 panels: **AI Assets** (thumbnails + tool/model/prompt from pack.csv, badge "pre-generated offline") → **Auto-montage** (Build variants = instant, client-side; grid of 12 cards; pick H/B/C → Player) → **Rendered** (MP4 list + CSV metrics). Optional "Replay pipeline" animation labeled replay. Remove `/api/generate`; `output: 'export'` | zero network on select; static build serves from `out/` folder of Next |
| P7 | Proof pack | README (honest wording, provenance, licenses, measured numbers from Raph's local render), Loom 60–90 s, 5-line email | every number traceable to CSV |

## 3. Honesty rules (non-negotiable)
1. Assets = "generated offline with <tool> (prompt in pack.csv)". Never "generated live" unless it was.
2. Any progress animation that is not a real run is labeled **Replay of cached run**.
3. Numbers only from `out/manifest.csv`; sandbox render numbers (1 vCPU) are not README numbers.
4. Fictional brand NORDA; demo copy, not product claims. Free-tier licenses (ElevenLabs/Suno) noted in README.

## 4. Upgrade path (document, do not build)
Live adapters behind the same slot contract: TTS with native timestamps (ElevenLabs/fal), AI B-roll (fal Kling ~$0.07/s), scripts (OpenRouter), cloud render (`@remotion/lambda`). Asset reuse math: 12 variants need 7 clips, not 36 (≈81 % fewer generation calls).

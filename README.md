# Ryze Video Engine (prototype)

Data-driven short-video engine: **one Remotion template + one JSON manifest = one video.**
Idea → script (OpenRouter) → B-roll + voiceover with word timestamps (fal.ai) → `manifest.json` → Remotion → MP4.

```
 idea ──► OpenRouter (strict JSON, 3 scenes, zod-validated)
              │
              ▼
   fal.ai ×3 scenes in parallel: Kling B-roll (9:16) + ElevenLabs TTS (word timestamps)
              │
              ▼
        manifest.json  ◄── the only contract (src/schema.ts)
         │          │
         ▼          ▼
 @remotion/player   scripts/render-mvp.ts ──► out/*.mp4 + out/manifest.csv
 (Vercel dashboard,  (bundle once, render loop,
  instant preview)    seconds/video recorded)
```

## Quick start (no API keys needed)

```bash
npm install
npm run seed        # 3 demo manifests -> data/manifests/
npm run dev         # dashboard at http://localhost:3000 (presets + JSON editor + live Player)
npm run render      # data/manifests/*.json -> out/*.mp4 + out/manifest.csv
npm run studio      # optional: Remotion Studio
```

First `npm run render` downloads Chrome Headless Shell (Remotion does it automatically).

## Live mode (real OpenRouter + fal.ai)

```bash
cp .env.example .env.local     # fill OPENROUTER_API_KEY and FAL_KEY
npm run generate -- "idea one" "idea two" "idea three"   # -> data/manifests/*.json
npm run render
```

Or use the dashboard: switch **MOCK → LIVE**, press **Generate**, watch the status log, download `manifest.json`.
Commit live-generated manifests: `app/page.tsx` loads everything in `data/manifests/` as dashboard presets,
so the deployed demo shows real AI footage instantly without spending credits.

**Safety:** live mode spends credits. On a production deploy it works only if `LIVE_ACCESS_CODE` is set
(the dashboard then asks for it). Leave it unset to keep the public demo mock/preset-only.

## What is where

| Path | Role |
|---|---|
| `src/schema.ts` | zod: LLM script, word timings, **Manifest** (inputProps), API request |
| `src/lib/openrouter.ts` | strict JSON script, validated, 1 retry on invalid output |
| `src/lib/fal.ts` | B-roll + TTS calls (model IDs overridable via env) |
| `src/lib/words.ts` | normalises provider timestamps (several shapes) to scene-local ms; estimated fallback |
| `src/lib/pipeline.ts` | orchestration, shared by the API route and the CLI |
| `src/remotion/AIVideoTemplate.tsx` | template: B-roll per scene, hook 0-3s, word-synced captions, CTA, optional music |
| `app/api/generate/route.ts` | streams status logs (NDJSON) + final manifest |
| `scripts/render-mvp.ts` | bundle once → render loop → `out/manifest.csv` |

Video length is data-driven: `calculateMetadata` sums the scene voiceover durations stored in the manifest.

## Iterating on metrics, not looks

`variantId` = `{idea}_{captionStyle}_{id}`. `out/manifest.csv` has empty `spend, ctr, hook_rate_3s, hold_rate` columns:
paste Meta/TikTok exports joined on `variant_id`, then change one template variable (hook text, caption style, music) per variant.

## Scaling: what is real, what is not

- **Implemented and tested:** pipeline stages, manifest contract, dynamic duration, batch loop with timing.
- **Not implemented:** cloud rendering. Rendering inside Vercel functions is a bad fit (time/memory limits).
  The intended production path is `@remotion/lambda` (same manifests as `inputProps`, MP4s to S3). Only the local batch is built.
- **Throughput:** measure with `npm run render` and read `render_sec` in `out/manifest.csv`.
  Measured on my machine: _fill in after the first run_.

## Notes

- Preview is rendered in the browser (Player), MP4 is rendered by `scripts/render-mvp.ts`.
- fal.ai documents the TTS `timestamps` field as untyped; the parser accepts several shapes and falls back to estimated timings (logged as WARN).
- Remote asset URLs (fal.media) are used as-is; archive them yourself if you need long-term storage.
- Remotion requires a company license for commercial use by companies; free for individuals.

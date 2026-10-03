> **PRECEDENCE:** `docs/FINAL_INSTRUCTIONS.md` (Route A, zero-spend) overrides this file where they conflict: local B-roll is the default (Pexels optional), ElevenLabs is not in the default path, public demo = local + GitHub (Netlify/Cloudflare static optional; Vercel Hobby is non-commercial), contract = its §4.

# PLAN.md: Ryze Video Engine v0.2 (free-first, paid = env switch)

> Для Raph (RU, 30 секунд): план для Claude Code, 10 фаз, каждая = одна короткая сессия + `/clear` + коммит.
> Базовый $0-набор: **скрипты из файла** (или OpenRouter `:free`) → **Edge-TTS** (+Whisper для таймкодов) → **Pexels portrait B-roll** (+твои клипы из бесплатных кредитов Kling/Higgsfield) → **локальный рендер** → **Vercel Hobby**.
> Платное (fal Kling, ElevenLabs, Claude, Lambda) подключается переменной `PROFILE=paid` и описано в README как «что станет лучше», но не строится.
> Минимальный путь на малом бюджете Claude Code: **P0 → P1 → P2 → P3 → P5 → P6 → P8**. Рекомендуемый: + P7. Полный: + P4, P9.
> Инструкции ниже на английском намеренно: меньше токенов.

Labels: [CONFIRMED] verified on the web 2026-10 (sources at the end) | [INFERENCE] | [ASSUMPTION] verify before relying | [EXPERIMENT] run it and look.

---

## 1. Base state (v0.1, from `ryze-video-engine.zip`)

Verified in sandbox [CONFIRMED]: `tsc` clean, `next build` OK, API streams NDJSON, 28/28 checks in `scripts/verify.tsx` (normalizer, schema, SSR smoke at 5 frames × 4 manifests).
NOT verified: MP4 render (Chrome host blocked in sandbox), visual look of captions, any live API call.

Known gaps this plan fixes:

| ID | Gap (in code today) | Fixed in |
|---|---|---|
| G1 | `render-mvp.ts` calls `ManifestSchema.parse` inside `.map` → ONE bad manifest kills the whole batch | P6 |
| G2 | Render is sequential, no `p-limit`, no memory measurement → "OOM-safe" is unproven | P6 |
| G3 | No Hook/Body/CTA permutation layer (manifest = 3 free-form scenes) | P5 |
| G4 | Assets are remote URLs only (CORS/expiry risk); local paths unsupported | P1 |
| G5 | `OPENROUTER_MODEL` default slug unverified (Gemini draft says it doesn't exist; also unverified) | P4 |
| G6 | Clip length hardcoded 5 s (`CLIP_FRAMES` in `AIVideoTemplate.tsx`) | P1 |
| G7 | Caption look never seen by a human | P7 |
| G8 | Scene audio length = last word end + 0.35 s; real file length never probed | P3 |

---

## 2. Free vs paid stack

| Layer | FREE default ($0) | Hard limits [CONFIRMED] | PAID upgrade (env) | What paid buys |
|---|---|---|---|---|
| Script | `data/scripts/*.json` (0 calls) → OpenRouter `:free` → Groq free → local Ollama | OpenRouter: 20 req/min, 50/day (1000/day after a one-time $10 purchase), free list rotates without notice, HTTP 402 if balance < 0. Groq gpt-oss-120b: 30 rpm, 1000/day, 200k tokens/day | Claude/GPT via OpenRouter paid | reliable strict JSON, better hooks, no daily cap |
| Voice | Edge-TTS (no key). ElevenLabs free key only for the 3 final demo videos | Edge-TTS is unofficial; v7 returns sentence boundaries unless word boundaries are requested explicitly; Microsoft token changes caused 403 breakages. ElevenLabs free: 10k credits/mo (~10 min), **no commercial license** (API access on free: sources conflict [ASSUMPTION]) | fal ElevenLabs v3 $0.10 / 1k chars, or ElevenLabs Starter $5/mo (30k credits, commercial) | voice quality, native timestamps, license |
| Word timings | boundary events → Whisper.cpp local (`@remotion/install-whisper-cpp`) → estimated | local CPU; needs 16 kHz wav; English model for English ads | `timestamps:true` in the TTS call | no extra step |
| B-roll | Pexels portrait stock → your own clips from Kling/Higgsfield free web credits (`local` provider) | Pexels: 200 req/h, 20 000/mo, free license, credit photographer when possible. Kling free credits are NOT guaranteed (Aug 2026) | fal Kling 2.5 Turbo Pro $0.07/s | unique footage matched to each script |
| Render | local `npm run render` | your CPU/RAM | `@remotion/lambda` | parallel scale |
| Hosting | GitHub + Vercel Hobby | Hobby = personal/non-commercial; function time caps vary by plan [ASSUMPTION] | Vercel Pro | n/a |
| Remotion license | free for individuals and ≤3 employees | Company: "Automators" $0.01/render, $100/mo minimum | n/a | Ryze pays this, not you |

### Cost of the PAID test run [ASSUMPTION: prices from fal pages 2026, re-check fal.ai/pricing before spending]

| Scenario | Clips | Seconds | Kling cost | TTS (~80 chars × unique texts) |
|---|---|---|---|---|
| 3 videos × 3 scenes, no reuse | 9 | 45 s | **$3.15** | ~$0.07 |
| 12 variants, NO asset reuse | 36 | 180 s | $12.60 | ~$0.29 |
| 12 variants WITH slot reuse (P5) | 7 | 35 s | **$2.45** | ~$0.06 |

Slot reuse = 3 hooks + 2 bodies + 2 CTAs generated once, combined 12 ways → ≈81 % fewer paid calls. This is the efficiency story for Ryze; it also keeps the free tier inside its limits (7 Pexels searches vs 200/h).

### Keys to get (10 min, no card) → `.env.local`

```
PROFILE=free                     # free | paid | mock
SCRIPT_PROVIDER=static           # static | openrouter
VOICE_PROVIDER=edge              # edge | elevenlabs | fal | mock
BROLL_PROVIDER=pexels            # pexels | local | fal | mock
PEXELS_API_KEY=                  # pexels.com/api (free, instant)
OPENROUTER_API_KEY=              # optional, :free models only
OPENROUTER_MODELS=               # comma list of :free ids, filled by P4 picker
ELEVENLABS_API_KEY=              # optional, final demos only
ELEVENLABS_VOICE_ID=
FAL_KEY=                         # paid only, leave empty now
VOICE_TIMING=auto                # auto | boundary | whisper | estimated
```

---

## 3. Target architecture

```
scripts (static | openrouter:free) ─► slots/{hooks,bodies,ctas}.json
        │
        ▼  build-variants.ts (each UNIQUE slot item generated once, cached by sha1)
  providers/script|voice|broll  ──►  public/generated/<sha1>.{mp3,mp4}  +  data/slot-assets.json
        │
        ▼  composeManifest(H,B,C,style)   (pure fn, also runs in the browser)
  data/manifests/H1_B2_C1_hormozi.json ...   ──►  Player (Vercel)  |  render-mvp.ts ──► out/*.mp4 + manifest.csv
```

Manifest contract is unchanged except: `scene.clipSec?: number|null`; `videoSrc/audioSrc` may be a relative path (`generated/<sha1>.mp4`) → template resolves with `staticFile()`.

---

## 4. Phases

How to run each: `claude` in repo root → `Execute PLAN.md §P<n>. Follow CLAUDE.md.` → after commit `/clear`. Cheaper model for mechanical phases (P0, P2, P6, P9); stronger for P1, P3.

### P0: baseline gate (~15 min)
Do: unzip, `npm i`; copy `verify.tsx` → `scripts/verify.tsx`; add npm script `"verify": "tsc --noEmit && tsx scripts/verify.tsx"`; copy `CLAUDE.md` + `PLAN.md` to repo root; `npm run seed`; `git init`; commit.
Accept: `npm run verify` → `ALL PASSED (28 checks)`.

### P1: provider layer + local assets (G4, G6)
Files: `src/providers/{types,script,voice,broll,index}.ts`, `src/lib/assets.ts`, edit `src/lib/pipeline.ts`, `src/schema.ts`, `src/remotion/AIVideoTemplate.tsx`, `.gitignore` (`.cache/ .whisper/`).
Do:
1. Interfaces: `ScriptProvider.script(idea)→Script`; `VoiceProvider.speak(text)→{audioFile, words, durationSec, timingSource}`; `BrollProvider.clip({searchQuery,visualPrompt})→{videoFile, clipSec, credit?}`. `mock` implementation of each = current mock behavior.
2. `assets.ts`: `cacheKey(provider,input)=sha1`; `saveToPublic(buf,ext)→"generated/<sha1>.<ext>"` (relative, no leading slash); cache index in `.cache/` so a re-run never re-calls an API.
3. `pipeline.ts` picks providers from env (`PROFILE` sets defaults; per-layer vars override). Keep `runPipeline` signature and current mock output byte-compatible.
4. Schema: `SceneSchema.clipSec: z.number().positive().nullable().optional()`. `ScriptSceneSchema` gets `searchQuery: z.string()` ("2-4 English words for stock-footage search"); update `mockScript`, `SEED_PRESETS`, OpenRouter prompt.
5. Template: `const src = (s:string)=> /^https?:\/\//.test(s) ? s : staticFile(s)` for video, audio, music. `Loop durationInFrames = Math.round((scene.clipSec ?? 5) * FPS)`. Do not loop when the clip is longer than the scene.
6. verify.tsx: add an SSR case with a relative `videoSrc`/`audioSrc` manifest.
Accept: verify green; `npm run generate -- --mock "x"` still works; `grep -rn "providers/" src/remotion src/components` → empty.

### P2: free B-roll: Pexels + local (needs `PEXELS_API_KEY`)
Files: `src/providers/pexels.ts`, `src/providers/local.ts`, `scripts/ingest-assets.ts`.
Do:
1. Pexels: `GET https://api.pexels.com/v1/videos/search?query=<searchQuery>&orientation=portrait&size=medium&per_page=10`, header `Authorization: $PEXELS_API_KEY`. Pick the `video_files` entry with `height > width`, `width >= 720`, smallest `link`; download to `public/generated/`; reject files > 6 MB and try the next. `clipSec = min(video.duration, 8)`. Cache by query. On 429 stop and print the reset time (check `X-Ratelimit-*` headers on 2xx). [ASSUMPTION: base `/v1/videos/`; the old `/videos/` path is deprecated, verify with one curl]
2. Append every used clip to `public/generated/CREDITS.md` (photographer + URL).
3. `local.ts`: pick from `public/assets/broll/*.mp4` by filename keywords vs `searchQuery`, else round-robin. `ingest-assets.ts <dir>`: compress each file to 720×1280, crf 28, strip audio, target ≤ 3 MB, via `npx remotion ffmpeg` [ASSUMPTION: command exists in 4.0.532, verify; else system ffmpeg].
Accept: `SCRIPT_PROVIDER=static VOICE_PROVIDER=mock BROLL_PROVIDER=pexels npm run generate -- "x"` → manifest with `generated/*.mp4`, each ≤ 6 MB, `CREDITS.md` written; verify green. (Windows PowerShell: set the vars with `$env:NAME="value"` first, or put them in `.env.local`.)

### P3: free voice + word timings (G8). **SPIKE GATE: stop and report after step 1**
Files: `scripts/spike-voice.ts`, `src/providers/edge.ts`, `src/providers/whisper.ts`, `src/providers/elevenlabs.ts`, `scripts/setup-whisper.ts`.
Do:
1. SPIKE: `npm i msedge-tts`; read its README/types (do not guess option names). Synthesize "This is a short test of word level timing." with word boundaries requested; print event counts by type; save mp3. **Report:** word events received? yes/no. Decision: ≥7 word events → `boundary` path; else → `whisper` path.
2. `edge.ts`: voice `en-US-AriaNeural` (default, env override). Save mp3 via `saveToPublic`.
3. Timing resolver by `VOICE_TIMING`: `auto` = boundary events if word-level → whisper → estimated (existing `evenWords`, log WARN).
4. Whisper: `npm i --save-exact @remotion/install-whisper-cpp@4.0.532`. `setup-whisper.ts` (one-time): `installWhisperCpp({to:".whisper", version:"1.5.5"})` + `downloadWhisperModel({model:"base.en", folder:".whisper"})` [ASSUMPTION: model id valid; check the type]. Convert mp3 → 16 kHz wav (`npx remotion ffmpeg -i in.mp3 -ar 16000 out.wav -y`), `transcribe({..., tokenLevelTimestamps:true})`, `toCaptions` (check which of `toCaptions`/`convertToCaptions` exists in 4.0.532 types), `.text.trim()`, merge tokens into words, → `Word[]`. Windows may need a C++ toolchain for the whisper build: if install fails, report and stay on `estimated`. [ASSUMPTION]
5. Real duration: probe the mp3 (`npm i music-metadata`), `durationSec = max(lastWordEnd/1000 + 0.35, probed + 0.1)`.
6. `elevenlabs.ts` (final demos only): `POST https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/with-timestamps`, header `xi-api-key`; response `audio_base64` + char `alignment` → feed existing `normalizeWords` (it already parses `characters / character_start_times_seconds / character_end_times_seconds`). [ASSUMPTION: field names; log the raw keys on first call]
Accept: for 3 test sentences: `words.length ≥ 90 %` of whitespace tokens; `|lastWordEnd − probedDuration| < 0.6 s`; log prints `timingSource`. verify green.
Risk: Edge-TTS is a reverse-engineered Microsoft endpoint: fine for a test, not for a product. Pin the package version; never put it in README as "production TTS".

### P4: script providers (optional, G5)
Files: `src/providers/openai-compatible.ts` (generalize `src/lib/openrouter.ts`: `LLM_BASE_URL`, `LLM_API_KEY`), `scripts/pick-free-model.ts`, `data/scripts/*.json`.
Do:
1. `pick-free-model.ts`: `GET https://openrouter.ai/api/v1/models`; keep ids ending `:free` whose `supported_parameters` include `structured_outputs` or `response_format` [ASSUMPTION: field name, verify on the first response]; print 5 candidates; user pastes them into `OPENROUTER_MODELS`.
2. Provider tries models in order; on 404/402/429/empty/invalid JSON → next model; all fail → static fallback + WARN. If the model lacks json_schema support: prompt-only JSON + zod validate + 1 retry.
3. Day budget guard in `.cache/usage.json` (UTC day): refuse at 40 calls (free cap is 50/day).
4. `static`: 6 hand-written `ScriptSchema`-valid files (EN). Optional Groq: same code, `LLM_BASE_URL=https://api.groq.com/openai/v1`.
Accept: `SCRIPT_PROVIDER=static` makes 0 network calls; with a key, the picker prints ≥1 candidate; 50 forced failures never crash the CLI.

### P5: permutation engine (G3). **Needs approval of slot copy**
Files: `data/slots/{hooks,bodies,ctas}.json`, `src/lib/variants.ts` (pure, no fs), `scripts/build-variants.ts`, `data/slot-assets.json`.
Draft copy (placeholder; Raph edits; do NOT state Ryze product facts):

| id | text (voiceover) | searchQuery |
|---|---|---|
| H1 | Still burning your ad budget on guesswork? | stressed entrepreneur laptop |
| H2 | Your ads are not broken. Your testing is. | analytics dashboard screen |
| H3 | Scale your store without hiring a media buyer. | online store packaging |
| B1 | An autopilot launches dozens of ad variations, cuts the losers, and scales the winners while you sleep. | laptop night office |
| B2 | Keep the winning hook. Swap the body and the call to action. Test more, guess less. | team charts meeting |
| C1 | Try it free today. | smartphone hand scroll |
| C2 | Link in bio. | smartphone hand scroll |

Do:
1. `composeManifest(hook, body, cta, {style, look})` → Manifest; `variantId = "H1_B2_C1_hormozi"`; on-screen hook text = `hook.onScreen ?? first 6 words`. `enumerateVariants(slots, styles)` = cartesian product.
2. `build-variants.ts`: generate assets once per slot item through the providers (cache!), write `data/slot-assets.json` (slotId → Scene fields), write all manifests to `data/manifests/`. Print `N variants from M provider calls`.
3. Scaling to 5×4×5 = 100 is data-only: add rows, no code change.
Accept: 3×2×2 = 12 manifests, all valid; **M = 7 provider calls per layer, not 36**; verify has a case asserting `enumerateVariants(...).length === 12`.

### P6: render hardening + metrics (G1, G2)
Files: `scripts/render-mvp.ts`.
Do:
1. Per-file `safeParse`; invalid → log + skip; non-zero exit only if nothing rendered.
2. Flags: `--only <substr> --limit N --concurrency N --parallel K` (`p-limit`, default 1).
3. CSV columns: `variant_id, hook_id, body_id, cta_id, file, duration_sec, render_sec, rss_mb, caption_style, mode, hook, spend, ctr, hook_rate_3s, hold_rate` (last four empty on purpose; joined later on `variant_id`).
4. Record `process.memoryUsage().rss` after each video.
Accept: corrupt one manifest (`scenes: []`) → the others still render. Do NOT write "OOM-safe" anywhere until P9 has measured `parallel=1` vs `2` on all 12.

### P7: Template Playground UI (recommended; this is what the recruiter touches)
Files: `src/components/Dashboard.tsx`, `app/page.tsx`, `src/remotion/components/Captions.tsx`.
Do:
1. Four `<select>`: Hook, Body, CTA, Caption style. Player recomposes instantly via `composeManifest` + `slot-assets.json` (server component passes both as props). Zero network calls on change.
2. Collapse the JSON editor and the generate/live panel by default. Keep `LIVE_ACCESS_CODE` protection.
3. Caption safe zone for 9:16: keep text inside the central ~80 % width and above the bottom ~20 % (platform UI overlays) [ASSUMPTION: generic short-video practice]. Tune `paddingBottom` (now 380) after looking.
4. **Human QA (Raph):** open 3 viewport sizes + phone; check captions don't clip, active word is readable, hook is not cut.
Accept: build passes; DevTools Network empty on select change; verify green.

### P8: deploy (free). **Needs Raph: GitHub + Vercel login**
Do: keep `public/generated` ≤ ~40 MB total (compress via `ingest-assets.ts`) [ASSUMPTION: size comfort limit, check Vercel limits]; push to GitHub (no file > 100 MB); import to Vercel Hobby; set NO secrets, leave `LIVE_ACCESS_CODE` unset → demo is preset-only and spends nothing.
Accept: live URL plays all presets from local assets; `grep -rEn "FAL_KEY|OPENROUTER_API_KEY|PEXELS_API_KEY|ELEVENLABS" .next/static` → empty.

### P9: proof pack (cheap model)
Do: `npm run render` (all 12) on Raph's machine → `out/*.mp4`, `out/manifest.csv`. Fill the README table from the CSV: s/video, videos/hour = 3600 / avg, peak `rss_mb`, `parallel=1` vs `2`. Add README sections "Free stack used", "Paid upgrade path (not built)", Pexels credits. Draft Loom script (90 s) and a 5-line email. Run the claims audit below.
Accept: every number in README appears in `out/manifest.csv` or verify output.

---

## 5. Claims audit (what the README / email may say)

| Claim in the Gemini drafts | Reality today | Allowed wording |
|---|---|---|
| "OOM-safe via `p-limit`" | not in code (G2) | after P9: "sequential render, peak RSS X MB measured" |
| "Zod rejects one bad instance, not the batch" | false until P6 (G1) | true after P6 |
| "100+ videos/day" | unmeasured | "N s/video measured → ~X/hour on one machine" |
| "Claude 3.5 Sonnet via OpenRouter" | model unverified, free profile uses other models | "LLM is configurable via OpenRouter" |
| "Hormozi captions synced flawlessly" | SSR-smoked only | say it only after P7 human QA |
| "Scales on AWS Lambda" | not built | "path described, not built" |
| "Permutation 5×4×5 = 100" | 12 shipped after P5 | "12 shipped; scales by adding slot rows" |
| Pexels footage | generic stock look | disclose; paid Kling = unique footage |

## 6. Done = all true

- [ ] `npm run verify` green, committed per phase
- [ ] 12 manifests, 7 provider calls per layer, `out/manifest.csv` with measured s/video
- [ ] Playground changes the Player with no network calls
- [ ] No key in git history (`git log -p | grep -iE "api[_-]?key"` empty) or client bundle
- [ ] Vercel URL + GitHub + 3 MP4 + Loom + email
- [ ] README says what is built and what is only described

## 7. Risks

| Risk | Mitigation |
|---|---|
| Edge-TTS breaks (token/403 or no word boundaries) | pinned version; whisper path; estimated timings; ElevenLabs free for the 3 final demos |
| OpenRouter free model vanishes / 429 | model chain, static scripts, day counter |
| Whisper build fails on Windows | stay on `estimated`; do not block the submission |
| Pexels clips look generic | disclose; use own Kling/Higgsfield free-credit clips via `local` provider for the 3 hero videos |
| Vercel/GitHub asset size | compress, ≤ 3 MB per clip, total budget |
| First render downloads Chrome | needs internet on Raph's machine; one-time |

## 8. Sources (checked 2026-10-02)

OpenRouter limits: openrouter.ai/docs/limits · Groq/Gemini free comparison: blogs.novita.ai/free-llm-api-comparison-2026 (Gemini free quotas conflict across sources: verify in AI Studio) · Pexels API: pexels.com/api/documentation · Edge-TTS boundary change & 403 fixes: Anki-TTS-Edge release notes, edge-tts-go README · Remotion whisper: remotion.dev/docs/install-whisper-cpp · fal pricing: fal.ai/learn/tools/ai-video-generators, fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3 · ElevenLabs plans: casrai.org/guides/elevenlabs-pricing (Aug 2026) · Kling free credits: aiarty.com Kling pricing (Aug 3 2026) · Remotion license: remotion.dev/docs/pricing

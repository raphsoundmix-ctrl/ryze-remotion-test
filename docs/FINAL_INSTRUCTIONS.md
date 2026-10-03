**RYZE**

AI Ad Permutation Engine

**Final implementation instruction for a working prototype**

Next.js + Remotion · modular Hook / Body / CTA · local batch rendering · free-first

| **PRIMARY GOAL:** Prove the product idea with a reproducible local prototype that can compose multiple ad variants, preview them instantly, validate manifests, render a batch locally, and expose a clean recruiter-facing demo — while spending approximately \$0 and using zero paid LLM/video calls in the critical path. |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

| **SCOPE BOUNDARY:** This is an employment-test prototype, not a production SaaS. Do not build AWS/Lambda rendering, paid AI video generation, databases, auth, analytics ingestion, or a full marketing automation backend unless the core prototype is already green. |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 1. Executive decision

The two source documents describe the same concept but at different maturity levels. The DOCX provides the original product framing and stage plan; PLAN.md is the stronger engineering revision with explicit gaps, providers, verification, rendering metrics, and a free-first path. The final build should use PLAN.md as the engineering baseline, while retaining the original product story: a successful creative can be decomposed into reusable slots and recombined into many variants. The source plan itself proposes a 3×2×2 prototype (12 variants) before scaling the same data structure to 5×4×5 (100 variants).

| **Decision** | **Final choice**                                                | **Reason**                                                                                                                          |
|--------------|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Core         | Next.js + Remotion + TypeScript + Zod                           | Already matches the supplied project and provides both browser preview and deterministic local rendering.                           |
| Data model   | Hook / Body / CTA slots + immutable manifest                    | Makes permutation a pure data problem; no code changes are needed to increase the number of combinations.                           |
| AI copy      | Static JSON by default; OpenRouter :free as optional fallback   | Static copy consumes zero tokens and makes the demo deterministic. OpenRouter free is capped and model availability rotates.        |
| Voice        | Edge-TTS/local-first; Whisper only when needed for word timings | No API key required. Avoid making paid ElevenLabs the critical path.                                                                |
| B-roll       | Local assets first; Pexels API optional                         | A local asset pack is the cheapest and most reliable path. Pexels is free but requires attribution and has API limits.              |
| Rendering    | Local Remotion render; concurrency default 1                    | This is the only reliable way to prove the batch render without cloud spend.                                                        |
| Validation   | Zod shape validation + media preflight + per-manifest safeParse | Separates schema correctness from real media failures.                                                                              |
| Public demo  | Local demo + GitHub; Netlify Free optional for public preview   | Vercel Hobby is restricted to personal/non-commercial use under current terms; do not depend on it for a hiring/commercial context. |
| Proof        | 12 rendered MP4s + manifest.csv + README + short Loom           | Shows the product idea and engineering quality without claiming unmeasured scale.                                                   |

# 2. What was wrong or overstated in the source documents

| **ID** | **Source statement / design**                                                               | **Correction**                                                                                                      | **Implementation requirement**                                                                                    |
|--------|---------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| E1     | “Zod validation protects the pipeline if one of 100 videos has a bad link.”                 | Zod does not test whether a URL works, a file exists, duration is readable, or the codec is valid.                  | Run Zod safeParse per manifest, then media preflight before render; skip only the invalid item.                   |
| E2     | “OOM-safe” via p-limit.                                                                     | A concurrency limiter reduces simultaneous jobs but does not prove safe memory usage.                               | Measure RSS on every render; test concurrency 1 and 2; only then describe the measured behavior.                  |
| E3     | “100 unique MP4s.”                                                                          | 100 combinations are not necessarily 100 unique visual assets or semantically unique ads.                           | Call them 100 variants/combinations unless a separate uniqueness rule is implemented.                             |
| E4     | Hard-coded 0–3 / 3–10 / 10–12 seconds.                                                      | Audio and media may exceed a slot. Fixed timings can clip speech or force awkward loops.                            | Store clipSec/duration per scene; prototype may enforce 3/7/2 seconds, but validate audio against slot maximum.   |
| E5     | Original plan says 3 hooks + 2 bodies + 2 CTAs = 12, while narrative discusses 5×4×5 = 100. | Both are valid as prototype and scale target; mixing them in acceptance criteria is confusing.                      | Ship 12. Demonstrate that adding rows alone yields 100.                                                           |
| E6     | Remote URLs as assets.                                                                      | Remote media creates expiry, CORS, network and rate-limit risk during rendering.                                    | Cache/download assets to public/generated and reference stable relative paths.                                    |
| E7     | ElevenLabs free for final demo.                                                             | Current ElevenLabs page says free is personal/non-commercial; paid plans include commercial use.                    | Do not make ElevenLabs part of the default demo path. Use only if licensing is explicitly acceptable.             |
| E8     | Vercel Hobby as the default public deploy.                                                  | Current Vercel Terms limit Hobby use to personal/non-commercial use.                                                | For a hiring test, use local + GitHub as authoritative; use Netlify Free only if a public hosted demo is desired. |
| E9     | “anthropic/claude-sonnet-4.5 does not exist.”                                               | This exact model currently exists on OpenRouter. The original claim is outdated/incorrect.                          | Do not hardcode a model name; discover available models or use static scripts.                                    |
| E10    | OpenRouter as free core generation.                                                         | Free tier is currently 50 requests/day and free models can change.                                                  | Use it as optional fallback, with static JSON as the zero-cost source of truth and a local day budget.            |
| E11    | Pexels path is assumed.                                                                     | Pexels provides an official API, free, with default 200 requests/hour and 20,000/month; attribution is required.    | Use it only as a provider; cache every result and write CREDITS.md.                                               |
| E12    | “instant” preview.                                                                          | The Player can update composition without rendering, but it still needs local asset paths available to the browser. | Keep slot-assets.json in the client-readable path and compose a manifest in memory.                               |

# 3. Target architecture

┌───────────────────────────────┐  
│ Slot data (static JSON first) │  
│ Hooks / Bodies / CTAs │  
└──────────────┬────────────────┘  
│  
enumerateVariants() / composeManifest()  
│  
┌──────────────▼──────────────┐  
│ data/manifests/\*.json │  
│ Zod validated │  
└──────────────┬──────────────┘  
│  
┌───────────────────────┼────────────────────────┐  
│ │ │  
▼ ▼ ▼  
Template Playground preflight + verify batch renderer  
@remotion/player media + schema local Remotion  
zero network on select per-item safeParse p-limit / metrics  
│ │ │  
└───────────────┬───────┴───────────────┬────────┘  
▼ ▼  
recruiter-facing UI out/\*.mp4 + manifest.csv

## 3.1 Repository layout

ryze-video-engine/  
├─ app/  
│ └─ page.tsx  
├─ src/  
│ ├─ components/  
│ │ └─ Dashboard.tsx  
│ ├─ remotion/  
│ │ ├─ AIVideoTemplate.tsx  
│ │ └─ components/Captions.tsx  
│ ├─ providers/  
│ │ ├─ types.ts  
│ │ ├─ index.ts  
│ │ ├─ script.ts  
│ │ ├─ voice.ts  
│ │ ├─ broll.ts  
│ │ ├─ edge.ts  
│ │ ├─ pexels.ts  
│ │ └─ local.ts  
│ ├─ lib/  
│ │ ├─ assets.ts  
│ │ ├─ pipeline.ts  
│ │ ├─ variants.ts  
│ │ └─ preflight.ts  
│ └─ schema.ts  
├─ data/  
│ ├─ slots/  
│ │ ├─ hooks.json  
│ │ ├─ bodies.json  
│ │ └─ ctas.json  
│ ├─ slot-assets.json  
│ ├─ manifests/  
│ └─ scripts/  
├─ public/  
│ ├─ assets/broll/  
│ └─ generated/  
├─ scripts/  
│ ├─ verify.tsx  
│ ├─ build-variants.ts  
│ ├─ render-mvp.ts  
│ ├─ ingest-assets.ts  
│ └─ spike-voice.ts  
├─ out/  
├─ .cache/  
├─ .whisper/  
├─ .env.local  
├─ .env.example  
├─ CLAUDE.md  
├─ PLAN.md  
└─ README.md

# 4. Core data contract

Do not start by building the UI. First make the data contract deterministic. The UI, preview, permutation layer and renderer should all consume the same validated manifest type.

type WordTiming = {  
word: string;  
startMs: number;  
endMs: number;  
};  
  
type Scene = {  
id: string;  
text: string;  
onScreen?: string;  
videoSrc: string;  
audioSrc: string;  
musicSrc?: string;  
words?: WordTiming\[\];  
searchQuery?: string;  
clipSec?: number \| null;  
durationSec?: number;  
};  
  
const SceneSchema = z.object({  
id: z.string().min(1),  
text: z.string().min(1),  
onScreen: z.string().optional(),  
videoSrc: z.string().min(1),  
audioSrc: z.string().min(1),  
musicSrc: z.string().optional(),  
words: z.array(z.object({  
word: z.string().min(1),  
startMs: z.number().nonnegative(),  
endMs: z.number().positive(),  
})).optional(),  
searchQuery: z.string().min(1).optional(),  
clipSec: z.number().positive().nullable().optional(),  
durationSec: z.number().positive().optional(),  
});  
  
const ManifestSchema = z.object({  
variantId: z.string().regex(/^H\w+\_B\w+\_C\w+/),  
style: z.string().default('hormozi'),  
width: z.literal(1080),  
height: z.literal(1920),  
fps: z.literal(30),  
scenes: z.array(SceneSchema).length(3),  
});

## 4.1 Media preflight: the missing reliability layer

For every scene, validate both the schema and the actual asset. A preflight check should return a structured result and never throw out of the batch loop.

async function preflightAsset(src: string): Promise\<PreflightResult\> {  
// Local: verify file exists and is readable.  
// Remote: optional HEAD/GET with timeout; do not depend on it in the main path.  
// Media: probe duration / dimensions where possible.  
return {  
ok: true,  
src,  
reason: undefined,  
};  
}  
  
for (const manifestFile of manifestFiles) {  
const parsed = ManifestSchema.safeParse(loadJson(manifestFile));  
if (!parsed.success) {  
logSkip(manifestFile, 'schema_invalid', parsed.error);  
continue;  
}  
const media = await preflightManifest(parsed.data);  
if (!media.ok) {  
logSkip(manifestFile, 'media_preflight_failed', media.errors);  
continue;  
}  
await render(parsed.data);  
}

# 5. Free-first stack and provider policy

| **Layer** | **Default for test**                                                            | **Optional upgrade**        | **Use rule**                                                                                          |
|-----------|---------------------------------------------------------------------------------|-----------------------------|-------------------------------------------------------------------------------------------------------|
| Script    | Static JSON                                                                     | OpenRouter :free            | Never call an LLM just to prove the permutation engine.                                               |
| Voice     | Edge-TTS or committed local MP3s                                                | ElevenLabs paid / other TTS | Use free/local for the demo. Paid voice is cosmetic, not architectural.                               |
| Timings   | Edge word boundaries if available; otherwise Whisper local; otherwise estimated | Native alignment API        | A demo is acceptable with estimated timings if clearly labeled; do not claim perfect sync without QA. |
| B-roll    | Committed local MP4s                                                            | Pexels API / Kling          | Local assets eliminate API instability.                                                               |
| Preview   | @remotion/player                                                                | None needed                 | Must work with zero network calls on select changes.                                                  |
| Render    | Local Remotion                                                                  | Remotion Lambda             | Lambda is out of scope for prototype.                                                                 |
| Hosting   | Local + GitHub                                                                  | Netlify Free                | Only host a static/demo build; never expose secrets client-side.                                      |
| Storage   | Git repository + public/generated                                               | Object storage              | Keep prototype small; delete unnecessary generated media.                                             |

## 5.1 Why OpenRouter is not the critical path

Current OpenRouter pricing lists a free tier with 50 requests/day. That is useful for optional copy experimentation, but it is still an external dependency and free-model availability can change. Therefore the prototype should ship with static ScriptSchema-valid JSON. This guarantees deterministic demos and zero token spend. cite placeholder omitted in DOCX; see sources section.

## 5.2 Why Edge-TTS is a test adapter, not a product dependency

Edge-TTS is a practical no-key route for an employment prototype. However, it is an unofficial/reverse-engineered access path to Microsoft speech services, so its availability and event behavior can change. Pin the package version and keep a local MP3 fallback. Do not describe Edge-TTS as a production-grade commercial backend.

## 5.3 Why ElevenLabs should not be default

The current ElevenLabs pricing page lists a Free plan with 10,000 credits/month, while its own product page states that the free plan is for personal, non-commercial use and paid plans provide commercial usage rights. For this prototype, that means ElevenLabs is optional, not the zero-cost default and not something to rely on for a recruiter-facing asset whose licensing status is unclear.

# 6. Phase-by-phase implementation

## P0 — Baseline and reproducibility

Goal: establish a clean, repeatable starting point before touching the architecture.

1.  Unzip the supplied project into a clean directory.

2.  Open the repo in Cursor / VS Code and open PowerShell at the repo root.

3.  Run npm install.

4.  Copy the supplied CLAUDE.md and PLAN.md into the repository root if they are not already there.

5.  Copy verify.tsx into scripts/verify.tsx and add the npm verify script.

6.  Run npm run seed and then npm run verify.

7.  Create a git repository if one does not exist and commit the known-good baseline.

8.  Do not change UI or provider code until the baseline is green.

npm install  
npm run seed  
npm run verify  
git init  
git add .  
git commit -m "chore: establish prototype baseline"

## P1 — Provider interfaces and local asset support

Goal: make the system provider-agnostic without changing the existing public pipeline signature.

9.  Create ScriptProvider, VoiceProvider and BrollProvider interfaces.

10. Implement mock providers first. Preserve the current mock output so verify tests remain stable.

11. Create cacheKey(provider,input) based on sha1 and persist generated files under public/generated.

12. Add provider selection through environment variables. PROFILE=free should select the no-cost defaults.

13. Change scene schema to include clipSec and searchQuery.

14. Update the Remotion template to resolve HTTP URLs directly and local paths through staticFile().

15. Use the actual clipSec when building the scene duration; do not assume every clip is exactly 5 seconds.

## P2 — Local B-roll first; Pexels as optional provider

Goal: make the demo work with zero external calls.

16. Create public/assets/broll and place 4–7 short portrait clips there.

17. Name files with simple search keywords, for example stressed-entrepreneur-laptop.mp4.

18. Implement local.ts with keyword match and round-robin fallback.

19. Implement ingest-assets.ts to normalize the clips to a consistent portrait size, codec and maximum file size.

20. Only then implement pexels.ts as an optional provider.

21. Cache downloaded Pexels files and append photographer + URL to public/generated/CREDITS.md.

22. Never call Pexels on every permutation: the same searchQuery must resolve to one cached asset.

| **Pexels policy:** The current official documentation says the API is free, with a default 200 requests/hour and 20,000/month, and requires attribution. This is suitable as a fallback provider, not as a dependency for every render. |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## P3 — Voice and word timings

Goal: produce voiceover with a stable timing path while spending no API credits.

23. Run the voice spike before coding the final provider. Request word boundaries from the installed msedge-tts version and log exactly which events are returned.

24. If word-level events are available, use them directly.

25. If they are not available, route the generated audio through local Whisper timing extraction.

26. If Whisper setup fails on Windows, fall back to estimated word timings and log timingSource=estimated; do not block the prototype.

27. Probe actual audio duration with a media metadata library; never infer duration only from the last word end time.

28. For the final submission, prefer committed audio files if the TTS adapter proves unstable. The architecture should still expose VoiceProvider.

\# Suggested smoke test  
npm run voice:spike  
\# Expected output: event types / counts + generated test audio  
  
\# If Whisper is needed  
npm run whisper:setup

## P4 — Script generation: static first, OpenRouter optional

Goal: test permutation logic without spending tokens.

29. Create 6 ScriptSchema-valid static English script records.

30. Build OpenRouter as an optional OpenAI-compatible provider only after the static path passes.

31. On free-model lookup, inspect the actual current models endpoint rather than trusting an old hard-coded slug.

32. Use a model chain and fall back to static scripts on 404, 402, 429, invalid JSON or schema failure.

33. Add a local daily usage counter and stop before the provider limit.

34. Do not put OPENROUTER_API_KEY into browser code or public environment variables.

## P5 — Permutation engine

Goal: turn creative variation into pure data. The first deliverable is 3 hooks × 2 bodies × 2 CTAs = 12 variants.

| **ID** | **Example copy**                                                                                | **Search query**             |
|--------|-------------------------------------------------------------------------------------------------|------------------------------|
| H1     | Still burning your ad budget on guesswork?                                                      | stressed entrepreneur laptop |
| H2     | Your ads are not broken. Your testing is.                                                       | analytics dashboard screen   |
| H3     | Scale your store without hiring a media buyer.                                                  | online store packaging       |
| B1     | An autopilot launches dozens of ad variations, cuts losers, and scales winners while you sleep. | laptop night office          |
| B2     | Keep the winning hook. Swap the body and the call to action. Test more, guess less.             | team charts meeting          |
| C1     | Try it free today.                                                                              | smartphone hand scroll       |
| C2     | Link in bio.                                                                                    | smartphone hand scroll       |

These lines are prototype placeholders from the supplied plan. Do not present them as verified claims about Ryze unless the recruiter or company materials explicitly support them.

export function enumerateVariants(  
hooks: Hook\[\],  
bodies: Body\[\],  
ctas: CTA\[\],  
style = 'hormozi',  
) {  
return hooks.flatMap(h =\>  
bodies.flatMap(b =\>  
ctas.map(c =\> composeManifest(h, b, c, {style}))  
)  
);  
}  
  
// Prototype: 3 \* 2 \* 2 = 12  
// Scale target: 5 \* 4 \* 5 = 100  
// No algorithmic change required; only data rows change.

## P6 — Render hardening and metrics

Goal: make one broken item fail locally, not destroy the whole batch.

35. Read manifests one at a time.

36. Run ManifestSchema.safeParse; invalid entries are logged and skipped.

37. Run media preflight for every referenced video/audio file.

38. Wrap each render in try/catch and record success/failure in memory.

39. Add --only, --limit, --concurrency and --parallel flags.

40. Default concurrency to 1 for the submission.

41. Record render_sec and process.memoryUsage().rss after every video.

42. Write out/manifest.csv with variant IDs and measured timings.

43. Exit non-zero only if no item rendered successfully or if a fatal infrastructure error occurred.

npm run render -- --limit 3 --concurrency 1  
npm run render -- --limit 12 --concurrency 1  
npm run render -- --limit 12 --concurrency 2

| **Important:** Do not write “OOM-safe” in the README before the concurrency comparison is actually measured. The technically correct initial claim is “batch renderer with configurable concurrency and per-render RSS metrics.” |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

## P7 — Template Playground

Goal: give the recruiter a visible proof of the product idea. The key interaction is selecting Hook, Body, CTA and caption style and watching the Player update immediately.

44. Create a client-side Dashboard with Hook, Body, CTA and Caption Style select controls.

45. Load slot-assets.json as data. Do not call an API on every selection change.

46. Call composeManifest in memory and pass the resulting input to @remotion/player.

47. Keep the JSON editor and generate/live panel collapsed by default.

48. For 9:16, keep important text inside a central safe zone and above the lower UI-overlay area.

49. On a desktop viewport, make the player the visual anchor; controls should be grouped and compact.

50. Perform human QA on at least desktop, narrow phone-sized viewport and one intermediate width.

## P8 — Deployment

Goal: produce an optional public preview without adding runtime AI/API spending.

Preferred proof order: 1) local working prototype, 2) public Git repository, 3) optional public hosted UI. Because the current Vercel Terms say Hobby is for personal/non-commercial use, do not present Vercel Hobby as the only or authoritative deployment for a hiring/commercial context. Netlify currently advertises a Free plan that can be used for commercial projects, but its limits are usage-credit based; use it only for a small static/demo deployment. Cloudflare Pages is another lightweight static option, with static asset requests free and unlimited under its current Pages documentation.

51. Push the repository after removing all secrets and generated junk.

52. Keep no API keys in client bundles, public/, git history or README screenshots.

53. If using Netlify Free, deploy the demo without runtime AI calls. Keep secrets empty unless server-side functionality is genuinely required.

54. If using a static deployment, use the preset manifests and committed assets only.

55. Verify that the public page can be opened by a recruiter without a login and without a provider key.

## P9 — Proof pack and submission

56. Render all 12 variants locally.

57. Collect out/manifest.csv.

58. Calculate average seconds/video, videos/hour and peak RSS.

59. Capture one screenshot of the UI and one screenshot of the successful batch render.

60. Run a secret scan and a clean git diff.

61. Write README sections: Architecture, Data Contract, Free Stack, Render Metrics, Known Limitations, Paid Upgrade Path.

62. Record a 60–90 second Loom: choose Hook → choose Body → choose CTA → show instant preview → run batch render → show output folder/CSV → explain how 12 becomes 100 by adding rows.

63. Send GitHub + demo URL (if used) + Loom.

# 7. The 3 implementation routes

| **Route**                       | **Implementation**                                                                                   | **Approx. spend**         | **Risk**                         | **Use when**                                                                     |
|---------------------------------|------------------------------------------------------------------------------------------------------|---------------------------|----------------------------------|----------------------------------------------------------------------------------|
| A — Zero-spend, recommended     | Static scripts + local assets + Edge-TTS/local MP3 + local Remotion + optional public static hosting | \$0                       | Lowest external dependency       | Best fit for a hiring test. Proves architecture and product concept.             |
| B — Free APIs, still controlled | A adds Pexels and optionally OpenRouter free for experimentation                                     | \$0 if within free limits | Rate/model/credential dependency | Use when you want to demonstrate real provider adapters.                         |
| C — Small paid polish           | A/B plus a paid TTS or AI-video asset for 1–3 hero clips                                             | Small, variable cost      | Licensing and API cost           | Only after the core demo is green and you want one visually stronger hero video. |

Do not start with C. A visually polished AI-generated clip does not prove the permutation engine; it only improves the assets.

# 8. Commands: exact Windows path

## 8.1 Install and baseline

\# PowerShell  
cd "C:\path\to\ryze-video-engine"  
npm install  
npm run seed  
npm run verify

## 8.2 Development

npm run dev  
\# open http://localhost:3000

## 8.3 Build variants

npm run build:variants  
\# expected: 12 manifests for the prototype

## 8.4 Render

npm run render -- --limit 3 --concurrency 1  
npm run render -- --limit 12 --concurrency 1  
npm run render -- --limit 12 --concurrency 2

## 8.5 Example environment

PROFILE=free  
SCRIPT_PROVIDER=static  
VOICE_PROVIDER=edge  
BROLL_PROVIDER=local  
VOICE_TIMING=auto  
OPENROUTER_API_KEY=  
OPENROUTER_MODELS=  
PEXELS_API_KEY=  
ELEVENLABS_API_KEY=  
FAL_KEY=

For PowerShell, environment variables can be set for a session with \$env:NAME="value", but .env.local is preferable for this project because the application already expects dotenv configuration. Never commit .env.local.

# 9. Caption implementation rules

The source plan requests a Hormozi-style active-word highlight. Implement it as a reusable Caption component driven by the WordTiming\[\] array. The component should be frame-driven and deterministic; it should never make API calls or depend on a browser clock.

const frame = useCurrentFrame();  
const timeMs = (frame / FPS) \* 1000;  
  
const active = words.findIndex(  
w =\> timeMs \>= w.startMs && timeMs \< w.endMs  
);  
  
return words.map((w, i) =\> (  
\<span key={\`\${w.word}-\${i}\`} style={i === active ? activeStyle : baseStyle}\>  
{w.word}{' '}  
\</span\>  
));

QA checklist: active word is readable; no text is clipped; line breaks remain stable; safe-zone padding works at 1080×1920; hook does not disappear under the top UI; CTA remains visible long enough to read.

# 10. Error handling matrix

| **Failure**                      | **Detect**                            | **Action**                                                 | **User-visible result**                          |
|----------------------------------|---------------------------------------|------------------------------------------------------------|--------------------------------------------------|
| Invalid manifest JSON            | ManifestSchema.safeParse              | Skip file, log structured error, continue batch            | Other variants still render.                     |
| Missing local video              | fs.existsSync / preflight             | Skip variant and record reason                             | Dashboard can show unavailable state if desired. |
| Broken remote asset              | HTTP timeout/status or download error | Use cache; if no cache, skip asset/variant                 | No hard crash.                                   |
| Voice provider failure           | Provider throws/non-200               | Use cached audio or local fallback                         | Timing source logged.                            |
| No word timings                  | Provider returns only audio           | Use Whisper, then estimated fallback                       | Caption style degrades gracefully.               |
| Pexels 429                       | HTTP 429 + rate headers               | Stop provider calls; use local fallback                    | No repeated API hammering.                       |
| OpenRouter 429/402/404           | HTTP response                         | Try next configured free model, then static scripts        | Prototype remains usable.                        |
| Render OOM                       | Process error / RSS high              | Reduce concurrency to 1; do not rerun entire batch blindly | Some completed outputs remain.                   |
| Bad media duration               | Probe result                          | Reject or trim according to scene policy                   | Manifest marked preflight_failed.                |
| Secret detected in client bundle | grep/build scan                       | Fail release check                                         | No deployment until clean.                       |

# 11. Tests and acceptance criteria

| **Test**                 | **Expected result**                                                                                  |
|--------------------------|------------------------------------------------------------------------------------------------------|
| npm run verify           | All baseline checks pass.                                                                            |
| 3×2×2 permutation        | Exactly 12 valid manifests.                                                                          |
| Scale simulation         | Adding 2 hooks, 2 bodies and 3 CTAs as data produces 100 variants without changing permutation code. |
| Corrupt one manifest     | Only that manifest is skipped; others render.                                                        |
| Missing local asset      | Variant is skipped with a clear preflight reason.                                                    |
| Player select change     | No network request is generated by the selection itself.                                             |
| Render 12, concurrency 1 | All valid variants render or failures are explicitly recorded; metrics are written.                  |
| Render 12, concurrency 2 | Measured for comparison; no “safe” claim without evidence.                                           |
| Secret scan              | No API key in git history/client bundle/public output.                                               |
| Recruiter smoke test     | A person unfamiliar with the code can understand Hook → Body → CTA in under 30 seconds.              |

# 12. Metrics to report

The engineering report should include measured values, not marketing claims. Use the CSV generated by the renderer as the source of truth.

| **Metric**                     | **Formula / source**    | **Why it matters**                                   |
|--------------------------------|-------------------------|------------------------------------------------------|
| Variants rendered              | count(out/\*.mp4)       | Confirms batch function.                             |
| Average render time            | mean(render_sec)        | Lets you estimate throughput.                        |
| Videos/hour                    | 3600 / mean(render_sec) | Shows local throughput without claiming cloud scale. |
| Peak RSS                       | max(rss_mb)             | Evidence for memory behavior.                        |
| Concurrency comparison         | parallel=1 vs 2         | Shows whether parallelism is actually beneficial.    |
| Failure rate                   | failed / attempted      | Shows robustness.                                    |
| Player network calls on select | DevTools Network        | Proves preview is local/data-driven.                 |
| Provider calls                 | provider call counter   | Shows caching and cost control.                      |

# 13. Security and cost-control checklist

- No API key in client-side code, public/, screenshots, Git history or committed .env files.

- Use static assets and static copy by default; the demo should work when every provider key is empty.

- Cache every remote provider result by deterministic hash.

- Put explicit limits on OpenRouter calls and never retry indefinitely.

- Use request timeouts and a single retry at most for remote providers.

- Keep Fal/Kling/paid TTS code behind PROFILE=paid and do not call it in default mode.

- Never claim a paid or production capability that was not built and measured.

# 14. Ready-made resources / links

Use official templates and libraries where they accelerate implementation. Prefer the official Remotion templates over random starter repositories.

- [<u>Remotion official Next.js + Tailwind template</u>](https://github.com/remotion-dev/template-next-app-dir-tailwind)

- [<u>Remotion official Vercel/Sandbox template (reference architecture, not required for this MVP)</u>](https://github.com/remotion-dev/template-vercel)

- [<u>Remotion ecosystem resources</u>](https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/resources.mdx)

- [<u>p-limit</u>](https://github.com/sindresorhus/p-limit)

- [<u>Pexels API documentation</u>](https://www.pexels.com/api/documentation/)

- [<u>Pexels API help / free limits</u>](https://help.pexels.com/hc/en-us/articles/47677890260761-Is-the-Pexels-API-free-to-use)

- [<u>OpenRouter pricing / free limits</u>](https://openrouter.ai/pricing/)

- [<u>OpenRouter Claude Sonnet 4.5 model page</u>](https://openrouter.ai/anthropic/claude-sonnet-4.5/api)

- [<u>ElevenLabs pricing</u>](https://elevenlabs.io/pricing)

- [<u>Vercel Terms of Service</u>](https://vercel.com/legal/terms)

- [<u>Netlify pricing</u>](https://www.netlify.com/pricing/)

- [<u>Cloudflare Pages limits</u>](https://developers.cloudflare.com/pages/platform/limits/)

- [<u>Remotion license & pricing</u>](https://www.remotion.dev/docs/license/pricing)

# 15. Final README claims: approved wording

| **Do not write**                                   | **Write instead**                                                                                                  |
|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| “OOM-safe rendering of 100+ videos”                | “Local batch renderer with configurable concurrency and per-render RSS metrics; measured on 12-variant prototype.” |
| “Zod prevents one bad URL from crashing the batch” | “Per-manifest Zod validation plus media preflight lets the batch skip invalid variants without aborting.”          |
| “100 unique ads”                                   | “100 possible Hook × Body × CTA combinations from the same slot data.”                                             |
| “Perfect Hormozi subtitles”                        | “Word-highlight captions driven by timestamped word data; visually QA-tested on the prototype.”                    |
| “AI generates everything for free”                 | “AI providers are pluggable; the submitted prototype runs on static/local assets with optional free APIs.”         |
| “Production-ready”                                 | “Prototype demonstrating the permutation, preview and local-render architecture.”                                  |
| “Runs on AWS Lambda”                               | “Cloud rendering is a documented upgrade path; the prototype renders locally.”                                     |

# 16. Final execution order — do exactly this

64. P0: Baseline → verify green → git commit.

65. P1: Provider interfaces + local asset support → verify green → commit.

66. P2: Local B-roll + ingest → generate one manifest with zero API keys → verify.

67. P3: Edge/local voice → timing spike → choose boundary/Whisper/estimated path → verify.

68. P4: Static scripts → optional OpenRouter adapter only after static path works.

69. P5: Build 3×2×2 = 12 variants → verify every manifest.

70. P6: Harden renderer → corrupt-one test → run 3 renders → then run all 12.

71. P7: Build Playground → manual UI/Caption QA.

72. P8: GitHub → optional public host with no runtime secrets.

73. P9: Measure render time/RSS → create README metrics → record Loom → final secret scan → submit.

| **STOP CONDITION:** At any phase where the free path is blocked by an external provider, switch to the local/static fallback and continue. The objective is a working systems prototype, not a showcase of a specific AI vendor. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 17. Source traceability and web verification

Source A: “Мастер-План: AI Ad Permutation Engine (Прототип для Ryze)” — supplied DOCX. It defines the original product framing, three-slot composition, 5×4×5 scale target, initial Cursor/Claude division of labor, Playground concept, batch renderer and submission flow.

Source B: “PLAN.md: Ryze Video Engine v0.2 (free-first, paid = env switch)” — supplied Markdown. It contains the current engineering baseline, identified gaps G1–G8, provider architecture, P0–P9 phases, claims audit and free-first target.

External verification performed 03 Oct 2026: OpenRouter free limit/model availability, Vercel Hobby terms, Remotion licensing, Pexels API limits/attribution, ElevenLabs free/commercial terms, Netlify Free and Cloudflare Pages limits, and official Remotion starter resources were checked against current web documentation.

# Appendix A — Exact research links

**Remotion official Next.js + Tailwind template:** [<u>https://github.com/remotion-dev/template-next-app-dir-tailwind</u>](https://github.com/remotion-dev/template-next-app-dir-tailwind)

**Remotion official Vercel/Sandbox template (reference architecture, not required for this MVP):** [<u>https://github.com/remotion-dev/template-vercel</u>](https://github.com/remotion-dev/template-vercel)

**Remotion ecosystem resources:** [<u>https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/resources.mdx</u>](https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/resources.mdx)

**p-limit:** [<u>https://github.com/sindresorhus/p-limit</u>](https://github.com/sindresorhus/p-limit)

**Pexels API documentation:** [<u>https://www.pexels.com/api/documentation/</u>](https://www.pexels.com/api/documentation/)

**Pexels API help / free limits:** [<u>https://help.pexels.com/hc/en-us/articles/47677890260761-Is-the-Pexels-API-free-to-use</u>](https://help.pexels.com/hc/en-us/articles/47677890260761-Is-the-Pexels-API-free-to-use)

**OpenRouter pricing / free limits:** [<u>https://openrouter.ai/pricing/</u>](https://openrouter.ai/pricing/)

**OpenRouter Claude Sonnet 4.5 model page:** [<u>https://openrouter.ai/anthropic/claude-sonnet-4.5/api</u>](https://openrouter.ai/anthropic/claude-sonnet-4.5/api)

**ElevenLabs pricing:** [<u>https://elevenlabs.io/pricing</u>](https://elevenlabs.io/pricing)

**Vercel Terms of Service:** [<u>https://vercel.com/legal/terms</u>](https://vercel.com/legal/terms)

**Netlify pricing:** [<u>https://www.netlify.com/pricing/</u>](https://www.netlify.com/pricing/)

**Cloudflare Pages limits:** [<u>https://developers.cloudflare.com/pages/platform/limits/</u>](https://developers.cloudflare.com/pages/platform/limits/)

**Remotion license & pricing:** [<u>https://www.remotion.dev/docs/license/pricing</u>](https://www.remotion.dev/docs/license/pricing)

# Appendix B — Submission checklist

- \[ \] Clean GitHub repository URL

- \[ \] 12 MP4 files rendered locally

- \[ \] out/manifest.csv

- \[ \] README with measured numbers

- \[ \] UI screenshot

- \[ \] Terminal/batch screenshot

- \[ \] Loom 60–90 seconds

- \[ \] Optional public demo URL

- \[ \] No provider key required for core demo

- \[ \] No claims beyond measured implementation

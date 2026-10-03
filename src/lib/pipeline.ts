import type { CaptionStyle, Manifest, Scene } from "../schema";
import { generateScript, llmModel } from "./openrouter";
import { generateBroll, generateVoice, ttsModel, videoModel } from "./fal";
import { LOOKS, buildMockManifest, mockScript } from "./mock";
import { normalizeWords } from "./words";

export type Log = (message: string) => void;
export type PipelineInput = { idea: string; captionStyle: CaptionStyle; mode: "mock" | "live" };

export const hasLiveKeys = () => Boolean(process.env.OPENROUTER_API_KEY && process.env.FAL_KEY);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "video";
const makeVariantId = (idea: string, style: CaptionStyle) =>
  `${slug(idea)}_${style}_${Date.now().toString(36)}`;

const look = (style: CaptionStyle) => (style === "hormozi" ? LOOKS.ugc : { ...LOOKS.avatar, accent: "#FFFFFF" });

/** idea -> script (OpenRouter) -> B-roll + TTS per scene (fal.ai, parallel) -> manifest. */
export async function runPipeline(input: PipelineInput, log: Log): Promise<Manifest> {
  const variantId = makeVariantId(input.idea, input.captionStyle);
  const t0 = Date.now();
  const lap = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  /* ───── MOCK: same stages, canned data, tiny delays so the UI shows progress ───── */
  if (input.mode === "mock") {
    log("[mock] 1/3 Scripting: canned 3-scene script");
    await sleep(350);
    const script = mockScript(input.idea);
    log("[mock] 2/3 Media: placeholder video + estimated word timings");
    await sleep(450);
    const manifest = buildMockManifest({ idea: input.idea, variantId, captionStyle: input.captionStyle, look: look(input.captionStyle), script });
    log(`[mock] 3/3 Manifest ready: ${manifest.scenes.length} scenes (${lap()})`);
    return manifest;
  }

  /* ───── LIVE ───── */
  log(`1/3 Scripting via OpenRouter (${llmModel()})`);
  const script = await generateScript(input.idea);
  log(`    script ok: "${script.hook}" (${lap()})`);

  log(`2/3 Media via fal.ai: ${script.scenes.length} scenes in parallel (video ${videoModel()}, voice ${ttsModel()})`);
  const scenes: Scene[] = await Promise.all(
    script.scenes.map(async (s, i): Promise<Scene> => {
      const n = i + 1;
      const [videoSrc, voice] = await Promise.all([
        generateBroll(s.visualPrompt).then((u) => (log(`    scene ${n}: video ready (${lap()})`), u)),
        generateVoice(s.voiceover).then((v) => (log(`    scene ${n}: voice ready (${lap()})`), v)),
      ]);
      const { words, durationSec, source } = normalizeWords(voice.rawTimestamps, s.voiceover);
      if (source === "estimated") log(`    scene ${n}: WARN provider returned no word timestamps, using estimated timings`);
      return { id: n, voiceover: s.voiceover, visualPrompt: s.visualPrompt, videoSrc, audioSrc: voice.audioUrl, durationSec, words };
    }),
  );

  const manifest: Manifest = {
    version: 1,
    variantId,
    idea: input.idea,
    createdAt: new Date().toISOString(),
    mode: "live",
    title: script.title,
    hook: script.hook,
    cta: script.cta,
    captionStyle: input.captionStyle,
    look: look(input.captionStyle),
    musicSrc: null,
    scenes,
    models: { llm: llmModel(), tts: ttsModel(), video: videoModel() },
  };
  log(`3/3 Manifest assembled (${lap()})`);
  return manifest;
}

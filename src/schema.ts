import { z } from "zod";

/* ───────── Video constants (shared by Player, Studio, render script) ───────── */
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const HOOK_SECONDS = 3;

/* ═════════ 1. LLM OUTPUT: OpenRouter -> strict JSON (3 scenes) ═════════ */
export const ScriptSceneSchema = z.object({
  voiceover: z
    .string()
    .min(1)
    .describe("Exact words spoken in this scene: 1-2 short punchy sentences"),
  visualPrompt: z
    .string()
    .min(1)
    .describe(
      "Vertical 9:16 B-roll shot for a text-to-video model. Concrete subject, camera move, lighting. No text, logos or faces in frame.",
    ),
});

export const ScriptSchema = z.object({
  title: z.string().describe("Internal working title"),
  hook: z.string().describe("On-screen hook, max 8 words, shown in the first 3 seconds"),
  cta: z.string().describe("Closing call to action, max 6 words"),
  scenes: z.array(ScriptSceneSchema).length(3),
});
export type Script = z.infer<typeof ScriptSchema>;

/* ═════════ 2. fal.ai OUTPUT, normalised: words with scene-local timings ═════════ */
export const WordSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative(), // relative to the scene start
  endMs: z.number().nonnegative(),
});
export type Word = z.infer<typeof WordSchema>;

/* ═════════ 3. MANIFEST = the only thing Remotion needs (inputProps) ═════════ */
export const CaptionStyleSchema = z.enum(["hormozi", "clean"]);
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const LookSchema = z.object({
  accent: z.string(), // highlighted word colour
  bgFrom: z.string(), // placeholder gradient (used when a scene has no videoSrc)
  bgTo: z.string(),
});

export const SceneSchema = z.object({
  id: z.number().int().positive(),
  voiceover: z.string(),
  visualPrompt: z.string(),
  videoSrc: z.string().nullable(), // fal.ai URL | /public path | null => gradient placeholder
  audioSrc: z.string().nullable(), // fal.ai TTS URL | null => silent (mock)
  durationSec: z.number().positive(), // scene length = voiceover length (+ tail)
  words: z.array(WordSchema), // caption timings
});
export type Scene = z.infer<typeof SceneSchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  variantId: z.string(), // {slug}_{captionStyle}_{id} -> joins to ad metrics later
  idea: z.string(),
  createdAt: z.string(),
  mode: z.enum(["mock", "live"]),
  title: z.string(),
  hook: z.string(),
  cta: z.string(),
  captionStyle: CaptionStyleSchema,
  look: LookSchema,
  musicSrc: z.string().nullable(),
  scenes: z.array(SceneSchema).min(1).max(8),
  models: z.object({ llm: z.string(), tts: z.string(), video: z.string() }),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/* ═════════ 4. API request (dashboard -> /api/generate) ═════════ */
export const GenerateRequestSchema = z.object({
  idea: z.string().min(3).max(500),
  captionStyle: CaptionStyleSchema.optional(),
  mode: z.enum(["mock", "live"]).optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/* NDJSON events streamed back from /api/generate */
export type StreamEvent =
  | { type: "log"; message: string }
  | { type: "result"; manifest: Manifest }
  | { type: "error"; message: string };

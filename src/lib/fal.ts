import { fal } from "@fal-ai/client";

export const ttsModel = () => process.env.FAL_TTS_MODEL ?? "fal-ai/elevenlabs/tts/eleven-v3";
export const videoModel = () =>
  process.env.FAL_VIDEO_MODEL ?? "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";

function init() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  fal.config({ credentials: key });
}

/** 5s vertical B-roll. Output shape per fal docs: { video: { url } } */
export async function generateBroll(prompt: string): Promise<string> {
  init();
  const res = await fal.subscribe(videoModel(), {
    input: { prompt, duration: "5", aspect_ratio: "9:16" },
  });
  const url = (res.data as { video?: { url?: string } }).video?.url;
  if (!url) throw new Error(`fal video: no video.url in response: ${JSON.stringify(res.data).slice(0, 200)}`);
  return url;
}

/** TTS with word timestamps. `timestamps` is untyped (list<void>) in fal docs -> returned raw. */
export async function generateVoice(text: string): Promise<{ audioUrl: string; rawTimestamps: unknown }> {
  init();
  const res = await fal.subscribe(ttsModel(), {
    input: { text, voice: process.env.FAL_TTS_VOICE ?? "Rachel", timestamps: true },
  });
  const d = res.data as { audio?: { url?: string }; timestamps?: unknown };
  if (!d.audio?.url) throw new Error(`fal tts: no audio.url in response: ${JSON.stringify(d).slice(0, 200)}`);
  return { audioUrl: d.audio.url, rawTimestamps: d.timestamps };
}

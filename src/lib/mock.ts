import type { CaptionStyle, Manifest, Script } from "../schema";
import { normalizeWords } from "./words";

type Look = Manifest["look"];

export const LOOKS: Record<string, Look> = {
  ugc: { accent: "#FFE600", bgFrom: "#0D1B33", bgTo: "#1B4FD8" },
  avatar: { accent: "#7CFFB2", bgFrom: "#1B1233", bgTo: "#6D28D9" },
  broll: { accent: "#FF6B35", bgFrom: "#201008", bgTo: "#B45309" },
};

/** Deterministic stand-in for the OpenRouter step (sandbox / no-keys mode). */
export function mockScript(idea: string): Script {
  const short = idea.trim().replace(/\s+/g, " ").slice(0, 60);
  return {
    title: short,
    hook: "Stop scrolling. Read this.",
    cta: "Try it free today",
    scenes: [
      { voiceover: `Everyone gets this wrong about ${short}.`, visualPrompt: "Close-up, hands tapping a phone, shallow depth of field, warm light" },
      { voiceover: "Here is what actually works, and it takes under a minute.", visualPrompt: "Smooth top-down shot of a clean desk with a laptop and a coffee" },
      { voiceover: "Try it once and you will not go back. Link in bio.", visualPrompt: "Slow dolly toward a glowing screen in a dark room" },
    ],
  };
}

export function buildMockManifest(args: {
  idea: string;
  variantId: string;
  captionStyle: CaptionStyle;
  look: Look;
  script?: Script;
}): Manifest {
  const script = args.script ?? mockScript(args.idea);
  return {
    version: 1,
    variantId: args.variantId,
    idea: args.idea,
    createdAt: new Date().toISOString(),
    mode: "mock",
    title: script.title,
    hook: script.hook,
    cta: script.cta,
    captionStyle: args.captionStyle,
    look: args.look,
    musicSrc: null,
    scenes: script.scenes.map((s, i) => {
      const { words, durationSec } = normalizeWords(undefined, s.voiceover);
      return { id: i + 1, voiceover: s.voiceover, visualPrompt: s.visualPrompt, videoSrc: null, audioSrc: null, durationSec, words };
    }),
    models: { llm: "mock", tts: "mock", video: "mock" },
  };
}

/** 3 demo presets: same engine, different template feel. Used by `npm run seed`. */
export const SEED_PRESETS = [
  {
    variantId: "ugc-review_hormozi_seed",
    idea: "UGC review of a posture-correcting desk chair",
    captionStyle: "hormozi" as const,
    look: LOOKS.ugc,
    script: {
      title: "UGC Review",
      hook: "I returned my $900 chair for this",
      cta: "Link in bio",
      scenes: [
        { voiceover: "I returned my nine hundred dollar chair after two weeks.", visualPrompt: "Handheld shot of a person unboxing a desk chair, natural window light" },
        { voiceover: "This one fixed my back pain in four days. No joke.", visualPrompt: "Smooth side shot of someone sitting upright at a desk, warm light" },
        { voiceover: "Thirty day returns, so there is zero risk. Link in bio.", visualPrompt: "Slow push-in on a modern home office, soft morning light" },
      ],
    },
  },
  {
    variantId: "ai-avatar-pitch_clean_seed",
    idea: "AI avatar pitch for a meal-planning app",
    captionStyle: "clean" as const,
    look: LOOKS.avatar,
    script: {
      title: "AI Avatar Pitch",
      hook: "Dinner planned in ten seconds",
      cta: "Start free",
      scenes: [
        { voiceover: "You spend four hours a week deciding what to eat.", visualPrompt: "Overhead shot of a fridge being opened, cool light" },
        { voiceover: "This app plans your week and writes the grocery list.", visualPrompt: "Phone screen close-up with colorful food photos scrolling" },
        { voiceover: "Ten seconds. Done. Start free today.", visualPrompt: "Fast montage of plated meals on a wooden table, top-down" },
      ],
    },
  },
  {
    variantId: "product-broll_hormozi_seed",
    idea: "Product B-roll for a carbon fiber phone case",
    captionStyle: "hormozi" as const,
    look: LOOKS.broll,
    script: {
      title: "Product B-Roll",
      hook: "Lighter than your keys",
      cta: "Shop the drop",
      scenes: [
        { voiceover: "Real carbon fiber. Weighs less than your keys.", visualPrompt: "Macro slow pan across woven carbon fiber texture, dramatic rim light" },
        { voiceover: "Drop tested from two meters. Not a scratch.", visualPrompt: "Slow motion of a phone case hitting concrete, dark studio" },
        { voiceover: "Limited run. Shop the drop now.", visualPrompt: "Rotating product shot on a black pedestal, spotlight" },
      ],
    },
  },
];

/**
 * Engine constants with NO dependencies: safe for the browser bundle (no zod).
 * src/contract.ts re-exports everything here, so node code can keep importing from the contract.
 */
export const FPS = 30;
export const STYLES = ["hormozi", "clean"] as const;
export const FORMATS = {
  "9x16": { width: 1080, height: 1920 },
  "1x1": { width: 1080, height: 1080 },
  "4x5": { width: 1080, height: 1350 },
} as const;
export const SLOT_MAX_SEC = { hook: 4.0, body: 9.0, cta: 3.5 } as const;
export const LEAD_SEC = 0.25; // silence before the first word of every slot (after ingest)
export const TAIL_SEC = 0.35; // silence after the last word; must exceed the transition overlap
export const TRANSITION_FRAMES = 8;
export const CTA_HOLD_SEC = 1.0; // end-card hold, added by totalFrames, NOT part of durationSec / slot limits
export const HOOK_OVERLAY_SEC = 3.0;
export const MUSIC_VOLUME = 0.12;
export const MUSIC_DUCKED_VOLUME = 0.05;
export const DUCK_RAMP_FRAMES = 6;

export type Style = (typeof STYLES)[number];
export type Format = keyof typeof FORMATS;
export type SlotKind = keyof typeof SLOT_MAX_SEC;

export const TIMING_SOURCES = ["words.json", "srt", "silence", "tts-events"] as const;

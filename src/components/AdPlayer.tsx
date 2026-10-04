"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef } from "react";
import { FORMATS, FPS } from "../constants";
import type { Manifest } from "../contract";
import { totalFrames } from "../lib/timing";
import { AdVariant } from "../remotion/AdVariant";

/**
 * Peak simultaneous <Html5Audio> in AdVariant is 5 (outgoing VO + incoming VO + music + whoosh + pop
 * at the body->CTA cut), exactly the Player's default pool. 8 leaves headroom for template changes.
 */
const SHARED_AUDIO_TAGS = 8;

function PlayerError({ error }: { error: Error }) {
  return (
    <div role="alert" className="flex size-full flex-col items-center justify-center gap-2 bg-surface p-4 text-center">
      <span className="eyebrow text-bad">Composition error</span>
      <code className="text-[12px] text-text">{error.message}</code>
    </div>
  );
}

export default function AdPlayer({ manifest }: { manifest: Manifest }) {
  const ref = useRef<PlayerRef>(null);
  const { width, height } = FORMATS[manifest.format];

  // A new variant starts from its hook: the first 3 s are what the axis change is about.
  useEffect(() => {
    ref.current?.seekTo(0);
  }, [manifest.variantId]);

  return (
    <div data-testid="ad-player">
      <Player
        ref={ref}
        component={AdVariant}
        inputProps={manifest}
        durationInFrames={totalFrames(manifest)}
        fps={FPS}
        compositionWidth={width}
        compositionHeight={height}
        controls
        loop
        acknowledgeRemotionLicense
        numberOfSharedAudioTags={SHARED_AUDIO_TAGS}
        // With this on, PlayerControls moves focus to its play button on mount and on every
        // play/pause, pulling keyboard and screen-reader users out of the controls mid-page.
        spaceKeyToPlayOrPause={false}
        errorFallback={PlayerError}
        style={{ width: "100%" }}
      />
    </div>
  );
}

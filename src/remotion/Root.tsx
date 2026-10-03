import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { FPS, HEIGHT, ManifestSchema, WIDTH, type Manifest } from "../schema";
import { totalFrames } from "../lib/timing";
import { SEED_PRESETS, buildMockManifest } from "../lib/mock";
import { AIVideoTemplate } from "./AIVideoTemplate";

const p = SEED_PRESETS[0];
const defaultProps: Manifest = buildMockManifest({
  idea: p.idea, variantId: p.variantId, captionStyle: p.captionStyle, look: p.look, script: p.script,
});

// Length is data-driven: whatever manifest comes in decides the duration.
const calculateMetadata: CalculateMetadataFunction<Manifest> = ({ props }) => ({
  durationInFrames: totalFrames(props),
});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="AIVideo"
    component={AIVideoTemplate}
    schema={ManifestSchema}
    defaultProps={defaultProps}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={totalFrames(defaultProps)}
    calculateMetadata={calculateMetadata}
  />
);

import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { FORMATS, FPS, ManifestSchema, SlotAssetsSchema, type Manifest } from "../contract";
import { totalFrames } from "../lib/timing";
import { composeManifest, DEFAULT_AXES, slotIds } from "../lib/variants";
import slotAssets from "../../data/slot-assets.json";
import { AdVariant } from "./AdVariant";

const assets = SlotAssetsSchema.parse(slotAssets);
// First available slot of each kind: a pack that failed H1 at ingest must not break the bundle.
const ids = slotIds(assets);
const defaultProps: Manifest = composeManifest(assets, ids.hooks[0], ids.bodies[0], ids.ctas[0], { ...DEFAULT_AXES });

// Size and length are data-driven: the manifest decides format and duration.
const calculateMetadata: CalculateMetadataFunction<Manifest> = ({ props }) => ({
  durationInFrames: totalFrames(props),
  width: FORMATS[props.format].width,
  height: FORMATS[props.format].height,
});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="AdVariant"
    component={AdVariant}
    schema={ManifestSchema}
    defaultProps={defaultProps}
    width={FORMATS[defaultProps.format].width}
    height={FORMATS[defaultProps.format].height}
    fps={FPS}
    durationInFrames={totalFrames(defaultProps)}
    calculateMetadata={calculateMetadata}
  />
);

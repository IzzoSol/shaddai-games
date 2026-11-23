/* Local stub for @monogrid/gainmap-js (MIT), vendored for <model-viewer> 3.5.0.
   model-viewer imports exactly two names from that package, and only for HDR
   JPEG gainmap textures. Shaddai Arcade models are plain GLB/USDZ and never
   exercise those paths, so the real decoder is not shipped. If a gainmap JPEG
   is ever fed in, these throw a clear error instead of failing silently. */
import { Loader } from 'three';

export function extractGainmapFromJPEG() {
  throw new Error('gainmap JPEG decoding is not included in this build');
}

export class HDRJPGLoader extends Loader {
  load() {
    throw new Error('HDRJPGLoader is not included in this build');
  }
}

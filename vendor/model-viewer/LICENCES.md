# Vendored libraries — provenance (internal record only, never shown on screen)

- `model-viewer-module.js` — `@google/model-viewer` v3.5.0, Apache License 2.0.
  Source: https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer-module.js
- `three.module.js` — three.js r163 (peer dependency of model-viewer 3.5.0), MIT License.
  Source: https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js
- `gainmap-stub.js` — our own stub for `@monogrid/gainmap-js` (MIT). model-viewer
  imports two symbols from it, used only for HDR gainmap JPEG textures, which our
  GLB/USDZ assets never use; the stub throws a clear error if ever called.

Vendored 2026-11-21 for the Shaddai Arcade cross-platform AR layer (ar-place.js).

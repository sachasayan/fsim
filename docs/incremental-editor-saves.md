# Incremental Editor Saves

## Goal

- [ ] Avoid re-baking terrain on editor saves when terrain-affecting data has not changed.
- [x] Avoid re-baking terrain on editor saves when terrain-affecting data has not changed.
- [ ] Keep save behavior correct for terrain edits, terrain generator changes, terrain region changes, and runway-flattening inputs.
- [ ] Preserve fast iteration for non-terrain layer saves such as districts, roads, authored objects, and vantage changes.

## Phase 1: Confirm Current Coupling

- [x] Document the current save pipeline from editor `/save` API to `tools/commit-map-save.mjs`.
- [x] Verify which `map.json` fields affect baked terrain heights.
- [x] Verify which runtime systems still depend on metadata embedded in `world/world.bin`.
- [x] Capture the current rule for "surgical" terrain commits that clears `terrainEdits` after baking.

### Current Findings

- [x] Editor save writes `tools/map.json` through `tools/dev-server.mjs`, which immediately queues `tools/commit-map-save.mjs`.
- [x] `tools/commit-map-save.mjs` currently always runs `tools/bake-map.mjs` and then `tools/build-world.mjs`.
- [x] `tools/build-world.mjs` already supports reusing the existing `world/world.bin` terrain sampler.
- [x] `tools/bake-map.mjs` bakes terrain from normalized `map.json` data and serializes both height data and metadata into `world/world.bin`.
- [x] Runtime terrain systems still read `roads` and `hydrology` metadata from the static world payload, so skipping a bake without refreshing metadata would leave stale runtime data.
- [x] Additive terrain commits currently happen when `terrainEdits` are present and clean rebuild is not forced; after bake, committed `terrainEdits` are cleared from `tools/map.json`.

## Phase 2: Define Terrain Fingerprint Inputs

- [x] Create a canonical list of terrain-affecting inputs.
- [x] Include `terrainEdits`.
- [x] Include `terrainGenerator`.
- [x] Include `terrainRegions`.
- [x] Include `airports` if runway flattening still affects sampled heights.
- [x] Exclude non-terrain-only inputs once verified safe, likely `districts`, `roads`, `authoredObjects`, and `vantage`.
- [x] Decide where the fingerprint is computed and stored.
- [x] Normalize inputs before hashing so equivalent data produces the same fingerprint.

### Proposed Terrain Invalidation Table

| Field | In terrain fingerprint | Notes |
| --- | --- | --- |
| `terrainEdits` | Yes | Directly applied during baking and during additive commits. |
| `terrainGenerator` | Yes | Global terrain synthesis and hydrology source. |
| `terrainRegions` | Yes | Regional terrain synthesis and hydrology source. |
| `airports` | Yes | Baking enables runway flattening, so airport layout can change sampled heights. |
| `districts` | No | Appears to affect chunk generation, not baked terrain heights. |
| `roads` | No for height invalidation, yes for metadata freshness | Roads appear in runtime metadata and overlays, so stale metadata is still a problem even if heights are unchanged. |
| `authoredObjects` | No | Appears to affect object/chunk content, not height baking. |
| `vantage` | No | Saved in `config/vantage_points.json`, outside terrain bake inputs. |

### Normalization Rules

- [x] Reuse normalized editor save payloads or `normalizeMapData()` output before hashing.
- [x] Strip editor-only metadata and transient fields before hashing.
- [x] Sort object keys or serialize from a stable canonical structure before hashing.
- [x] Keep the fingerprint scoped only to terrain-invalidating fields so non-terrain saves can reuse existing terrain.

## Phase 3: Ship the Short-Term Win

- [x] Update `tools/commit-map-save.mjs` to compare the current terrain fingerprint against the last baked fingerprint.
- [x] Skip `tools/bake-map.mjs` when the fingerprint is unchanged and no clean rebuild was requested.
- [x] Continue running `tools/build-world.mjs` for non-terrain changes.
- [x] Preserve the existing additive terrain-edit flow when `terrainEdits` are present.
- [x] Emit clear progress/status messaging so the editor shows whether terrain was baked or reused.

## Phase 4: Handle `world.bin` Metadata Correctly

- [x] Audit which metadata in `world.bin` must stay fresh even when terrain heights are reused.
- [x] Decide between these approaches.
- [x] Patch only the `world.bin` metadata section when terrain geometry is unchanged.
- [ ] Move mutable/non-height metadata into a sidecar file and keep `world.bin` terrain-focused.
- [ ] Ensure road overlays, hydrology, and any terrain runtime systems still receive fresh metadata after save.

### Metadata Audit Notes

- [x] `world.bin` metadata currently includes broad normalized map data, not just terrain-only state.
- [x] Runtime terrain mesh rebuilds consume `roads` from static world metadata for road surface and marking overlays.
- [x] Runtime terrain mesh rebuilds consume `hydrology` from static world metadata for lake and river surfaces.
- [ ] Confirm whether any other systems still read non-terrain metadata from `world.bin` instead of `window.fsimWorld` or chunk outputs.
- [x] Short-term implementation choice: patch the metadata section in-place and carry the terrain fingerprint inside `world.bin` metadata.

## Phase 5: Validation

- [ ] Add tests for non-terrain saves that should skip terrain baking.
- [ ] Add tests for terrain-affecting saves that must trigger terrain baking.
- [ ] Add coverage for clean rebuild requests always forcing a bake.
- [ ] Add coverage for additive terrain-edit commits clearing `terrainEdits` only when appropriate.
- [x] Manually verify editor save progress text for both "rebake" and "reuse terrain" paths.

### Validation Notes

- [x] Ran `node tools/commit-map-save.mjs` once to seed the initial terrain fingerprint into the existing `world/world.bin`.
- [x] Confirmed `world/world.bin` metadata now includes a non-null `terrainFingerprint`.
- [x] Confirmed a second immediate `node tools/commit-map-save.mjs` run selected `Incremental (Reuse Terrain)` and skipped `bake-map`.
- [x] Confirmed the incremental path still ran `build-world`.
- [x] Verify the same behavior through the editor UI save flow and SSE progress stream.
- [ ] Verify runtime live reload updates road overlays and hydrology correctly after a reuse-terrain save.

### UI/SSE Validation Notes

- [x] Exercised the real `/save` API twice through the dev server with a temporary non-terrain map change and an exact restore of the original file.
- [x] Confirmed both `/save` responses returned `changed: true` and queued rebuild job ids.
- [x] Confirmed both rebuilds emitted `editor-build-progress` events over `/events`.
- [x] Confirmed both rebuilds reported step 2 as `Reusing baked terrain`, not `Baking terrain`.
- [x] Confirmed both rebuilds emitted `reload-city` after completion.
- [x] Confirmed the temporary validation field was removed and `tools/map.json` returned to its original content.

### Bug Fixes Discovered During Validation

- [x] Fixed a `world.bin` metadata patch bug where the rewritten metadata size was being updated on a copied buffer instead of the output buffer.
- [x] Repaired `world/world.bin` with a fresh bake after the broken metadata patch path had produced invalid JSON metadata.
- [x] Re-ran real `/save` validation after the fix and confirmed both saves stayed on the reuse path.

## Open Questions

- [ ] Should road data remain outside the terrain fingerprint if runtime road overlays still live in `world.bin` metadata?
- [x] Should fingerprint state live in a standalone cache file, inside `world.bin` metadata, or both?
- [ ] Is metadata patching enough, or is the cleaner long-term move to split terrain data from mutable world metadata?

## Recommended Next Slice

- [x] Implement terrain fingerprint generation in `tools/commit-map-save.mjs`.
- [x] Store the last baked terrain fingerprint in `world.bin` metadata as a short-term bridge.
- [x] If the fingerprint matches, skip quadtree rebuild and only refresh non-height metadata plus `build-world` output.
- [ ] Revisit sidecar metadata after the short-term skip-bake path is working and measurable.

## Implemented Now

- [x] Added a terrain fingerprint based on normalized `terrainEdits`, `terrainGenerator`, `terrainRegions`, and `airports`.
- [x] Persisted the terrain fingerprint in `world.bin` metadata during terrain bakes.
- [x] Reused existing terrain when the saved fingerprint matches and no clean rebuild or additive terrain commit is required.
- [x] Patched `world.bin` metadata in-place during terrain reuse so roads and other map-backed runtime metadata stay fresh.
- [ ] Validate the reused-metadata path against runtime visual behavior for road overlays and hydrology.
- [x] Do one fresh terrain bake after this change so existing `world.bin` files pick up their initial fingerprint seed.

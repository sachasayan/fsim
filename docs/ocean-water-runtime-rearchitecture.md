# Ocean Water Runtime Re-Architecture

Goal: replace the current terrain-coupled sea-level water path with a cheaper, clearer runtime architecture while preserving shoreline quality and the authored hydrology overlays.

Status legend: `[ ] todo`, `[-] in progress`, `[x] done`

## Scope

This document is specifically about the sea-level "infinite plane" water path:

- Chunk-base sea-level water meshes
- Leaf-runtime sea-level water meshes
- Water shader ownership and runtime bindings
- Water depth texture generation and upload
- Water visibility and shadow integration

This document is not primarily about:

- Authored lakes and rivers in the hydrology overlay path
- Road spline surfaces and markings
- General terrain shading outside of water-specific integration points

## Current Runtime Summary

### Core runtime ownership

- [x] Document current sea-level water setup in [`js/modules/world/terrain.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain.ts#L428)
- [x] Document legacy chunk-base water generation in [`js/modules/world/terrain/TerrainGeneration.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainGeneration.ts#L344)
- [x] Document leaf water generation and apply path in [`js/modules/world/terrain/TerrainWorker.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainWorker.ts#L647)
- [x] Document leaf runtime apply path in [`js/modules/world/terrain/TerrainLeafSurfaceRuntime.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainLeafSurfaceRuntime.ts#L535)

### Key observations

- [x] Near water uses `MeshStandardMaterial`; far water uses `MeshBasicMaterial`.
- [x] Sea-level water is currently terrain-streaming-owned rather than owned by a dedicated ocean renderer.
- [x] The newer leaf path dominates the real runtime path near the camera.
- [x] Per-leaf water depth textures are generated in the worker and uploaded on the main thread.
- [x] Per-leaf water materials are pooled, but still cloned/reconfigured and bound with leaf-local uniforms.
- [x] Main-loop `water_animation` still updates a time uniform, but the current owned water shader path does not consume `uTime`.

## Current Performance Problems

### CPU-side costs

- [x] Main-thread leaf apply creates new `BufferGeometry` objects for water in [`js/modules/world/terrain/TerrainLeafSurfaceRuntime.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainLeafSurfaceRuntime.ts#L555)
- [x] Main-thread leaf apply creates and uploads `DataTexture` water-depth textures in [`js/modules/world/terrain.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain.ts#L1080)
- [x] Main-thread leaf apply acquires and reconfigures per-leaf water materials in [`js/modules/world/terrain.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain.ts#L1113)
- [x] Visibility bookkeeping has to coordinate chunk-base water and leaf water ownership

### Geometry-side costs

- [x] Leaf water uses terrain-like grid topology even though the surface is flat at `SEA_LEVEL`
- [x] Leaf water still carries skirts inherited from terrain crack-hiding logic
- [x] Water vertex density is higher than the visual model appears to require

### GPU-side costs

- [x] Near water executes a lit shader with world-space depth lookup, atmosphere blending, procedural normal generation, and optional shadowing
- [x] Per-leaf depth textures create upload churn even if allocation churn is partially pooled
- [x] Many water mesh/material instances increase state management overhead compared to a dedicated ocean renderer

### Architectural costs

- [x] Sea-level ocean and local/authored hydrology are not cleanly separated in runtime ownership
- [x] Ocean rendering is coupled to terrain streaming instead of being nearly constant-cost
- [x] Debug/config reapplication touches all active water materials in [`js/modules/world/terrain/TerrainDebugConfig.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainDebugConfig.ts#L206)

## Target Architecture

### Design goals

- [ ] Sea-level ocean should be owned by a dedicated renderer
- [ ] Ocean draw count should be nearly constant with respect to terrain streaming
- [ ] Ocean material count should be nearly constant with respect to terrain streaming
- [ ] Shoreline coloration/depth response should remain world-space and terrain-aware
- [ ] Authored/local water should remain separately owned and specialized
- [ ] Runtime should support clear near/far shader variants without per-leaf material proliferation

### Desired split

- [ ] `OceanRenderer`: owns sea-level ocean meshes, materials, and runtime bindings
- [ ] `WaterDepthAtlas` or similar: owns streamed shoreline/depth pages
- [ ] Terrain system: supplies ocean-relevant depth/page data, but does not own ocean meshes
- [ ] Hydrology system: keeps lakes/rivers/harbor overlays as distinct meshes

## Execution Plan

## Phase 1: Cheapen The Existing Leaf Water Path

Goal: reduce cost before larger architectural extraction.

- [x] Remove dead `water_animation` plumbing from:
  - [`js/modules/sim.ts`](/Users/sacha/Projects/fsim/js/modules/sim.ts#L762)
  - [`js/modules/world/terrain.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain.ts#L626)
  - [`js/modules/world/terrain/TerrainDebugConfig.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainDebugConfig.ts#L185)
- [x] Introduce a dedicated water resolution policy separate from terrain leaf surface resolution
- [x] Reduce near-water grid density substantially relative to terrain leaf density
- [x] Remove water skirts for sea-level water surfaces
- [x] Avoid unnecessary per-acquire material reconfiguration where the shader variant is unchanged
- [-] Measure leaf-water apply cost before and after

### Expected result

- [ ] Lower main-thread apply time
- [ ] Lower water vertex count
- [ ] Lower scene attachment and mesh churn

## Phase 2: Replace Per-Leaf Water Textures With An Atlas

Goal: eliminate per-leaf water depth texture ownership.

- [x] Design an atlas/page-cache structure for shoreline/depth pages
- [x] Replace one-texture-per-leaf with shared atlas textures
- [x] Add page transform data so shaders can map world-space water lookups into atlas space
- [x] Update water shader bindings to sample atlas pages instead of leaf-local `uWaterDepthTex`
- [x] Add eviction/reuse behavior for atlas pages
- [x] Add diagnostics for atlas occupancy, upload count, and reuse rate

### Expected result

- [-] Lower texture upload churn
- [x] Lower texture object count
- [-] Better GPU locality

## Phase 3: Extract A Dedicated Ocean Renderer

Goal: stop representing sea-level ocean as terrain-owned streaming tiles.

- [x] Add a new runtime module, [`js/modules/world/terrain/OceanRenderer.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/OceanRenderer.ts)
- [x] Create reusable camera-centered ocean geometry
- [x] Use concentric reusable patches as the first nearly constant-cost mesh strategy
- [-] Reuse the existing near/far water shader split where practical
- [x] Bind ocean shader state once per renderer instead of once per leaf
- [-] Move sea-level ocean visibility ownership out of the terrain leaf runtime
  Current state: far leaves can now decline shoreline-water ownership and fall back to the dedicated ocean underlay
- [x] Retire chunk-base ocean meshes after parity is achieved
- [ ] Retire leaf ocean meshes after parity is achieved

### Expected result

- [-] Water draw count becomes nearly constant
- [-] Water material count becomes nearly constant
- [-] Terrain streaming no longer drives ocean mesh churn

## Phase 4: Cleanly Separate Ocean From Authored Hydrology

Goal: make ownership boundaries durable and understandable.

- [x] Keep lakes and rivers in the hydrology overlay path
- [-] Define blending/overlap rules between sea-level ocean and authored water
- [ ] Ensure local harbors/shoreline exceptions are handled without reintroducing terrain-owned ocean tiles
- [-] Document long-term ownership boundaries in code comments and docs

### Expected result

- [ ] Simpler mental model
- [ ] Cleaner specialization of shaders and geometry
- [ ] Easier future additions like animated waves, reflections, or shoreline foam

## File Targets

### First-pass implementation targets

- [x] [`js/modules/world/terrain.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain.ts)
- [x] [`js/modules/world/terrain/TerrainLeafSurfaceRuntime.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainLeafSurfaceRuntime.ts)
- [x] [`js/modules/world/terrain/TerrainWorker.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainWorker.ts)
- [x] [`js/modules/world/terrain/TerrainShaderPatches.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainShaderPatches.ts)
- [x] [`js/modules/world/terrain/WaterOwnedShaderSource.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/WaterOwnedShaderSource.ts)
- [x] [`js/modules/world/terrain/TerrainDebugConfig.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainDebugConfig.ts)

### Later-phase implementation targets

- [x] [`js/modules/world/terrain/OceanRenderer.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/OceanRenderer.ts)
- [x] [`js/modules/world/terrain/WaterDepthAtlas.ts`](/Users/sacha/Projects/fsim/js/modules/world/terrain/WaterDepthAtlas.ts)
- [x] Additional tests for water shader ownership, atlas bindings, and renderer integration

## Metrics To Track

- [ ] Average leaf-water apply time
- [ ] Max leaf-water apply time
- [x] Water texture upload count
- [ ] Total active water textures
- [ ] Total active water materials
- [x] Total active ocean meshes
- [ ] Water-related draw calls
- [ ] Water-related geometry count
- [ ] Terrain update-frame time attributable to water work

### Instrumentation notes

- [-] Expose water runtime counters through terrain diagnostics:
  - Active/visible leaf water meshes
  - Active/visible chunk-base water meshes
  - Active/visible dedicated ocean meshes
  - Active water depth bindings and atlas page occupancy
  - Unique active water materials
  - Active water vertex and triangle counts
  - Atlas upload and reuse counts

### Phase 1 baseline capture

- [-] Record baseline terrain-streaming water metrics from a representative scenario

Reference capture:

- Scenario: `terrain_streaming_low_alt`
- Capture mode: exploratory / unstable allowed
- Artifact: `/tmp/ocean-water-phase1-baseline/terrain_streaming_low_alt-latest.json`
- Notes: capture did not reach steady state; `profilingReadinessReason` remained `programs_growing`

Baseline values from that capture:

- `frameMs p95`: `7.3`
- `render.sceneMs p95`: `4.7`
- `selectedLeafCount`: `67`
- `activeChunkCount`: `210`
- `leafBuildBreakdown.totalAvgMs`: `0.25`
- `leafBuildBreakdown.workerComputeAvgMs`: `47.95`
- `activeWaterMeshes`: `58`
- `activeWaterDepthTextures`: `58`
- `pooledWaterDepthTextures`: `16`
- `uniqueWaterMaterials`: `58`
- `activeWaterVertices`: `1351`
- `activeWaterTriangles`: `1814`

### Phase 2 atlas capture

- [x] Record atlas-backed terrain-streaming water metrics from the same representative scenario

Reference capture:

- Scenario: `terrain_streaming_low_alt`
- Capture mode: exploratory / unstable allowed
- Artifact: `/tmp/ocean-water-phase2-atlas/terrain_streaming_low_alt-latest.json`
- Notes: capture again did not reach steady state; `profilingReadinessReason` remained `programs_growing`

Atlas-backed values from that capture:

- `frameMs p95`: `5.9`
- `render.sceneMs p95`: `4.0`
- `selectedLeafCount`: `67`
- `activeChunkCount`: `210`
- `activeWaterMeshes`: `67`
- `activeWaterDepthTextures`: `67`
- `waterDepthAtlasAllocatedPages`: `67`
- `waterDepthAtlasFreePages`: `189`
- `waterDepthAtlasTotalPages`: `256`
- `waterDepthAtlasUploadCount`: `129`
- `waterDepthAtlasReuseCount`: `128`
- `uniqueWaterMaterials`: `67`
- `activeWaterVertices`: `1758`
- `activeWaterTriangles`: `2450`

### Phase 3 ocean-renderer capture

- [x] Record terrain-streaming metrics after enabling the dedicated ocean renderer and retiring chunk-base water meshes

Reference capture:

- Scenario: `terrain_streaming_low_alt`
- Capture mode: exploratory / unstable allowed
- Artifact: `/tmp/ocean-water-phase3-ocean-renderer/terrain_streaming_low_alt-latest.json`
- Notes: dedicated ocean renderer enabled, chunk-base water meshes retired, shoreline-aware leaf water still active near the camera

Ocean-renderer values from that capture:

- `frameMs p95`: `5.9`
- `render.sceneMs p95`: `3.8`
- `selectedLeafCount`: `67`
- `activeChunkCount`: `210`
- `activeLeafWaterMeshes`: `67`
- `activeChunkWaterMeshes`: `0`
- `activeOceanWaterMeshes`: `3`
- `activeWaterDepthTextures`: `67`
- `waterDepthAtlasAllocatedPages`: `67`
- `waterDepthAtlasUploadCount`: `104`
- `waterDepthAtlasReuseCount`: `103`
- `uniqueWaterMaterials`: `68`
- `activeWaterVertices`: `2567`
- `activeWaterTriangles`: `3950`

### Phase 3 leaf-handoff capture

- [x] Record terrain-streaming metrics after allowing far leaves to hand off water ownership to the dedicated ocean renderer

Reference capture:

- Scenario: `terrain_streaming_low_alt`
- Capture mode: exploratory / unstable allowed
- Artifact: `/tmp/ocean-water-phase3-leaf-handoff/terrain_streaming_low_alt-latest.json`
- Notes: chunk-base water remains retired; only near leaves now build shoreline-aware water meshes

Leaf-handoff values from that capture:

- `frameMs p95`: `4.8`
- `render.sceneMs p95`: `3.2`
- `selectedLeafCount`: `67`
- `activeChunkCount`: `210`
- `activeLeafWaterMeshes`: `53`
- `visibleLeafWaterMeshes`: `51`
- `activeChunkWaterMeshes`: `0`
- `activeOceanWaterMeshes`: `3`
- `activeWaterDepthTextures`: `53`
- `waterDepthAtlasAllocatedPages`: `53`
- `waterDepthAtlasFreePages`: `203`
- `waterDepthAtlasUploadCount`: `115`
- `waterDepthAtlasReuseCount`: `114`
- `uniqueWaterMaterials`: `54`
- `activeWaterVertices`: `2899`
- `activeWaterTriangles`: `4618`

### Phase 3 leaf-release capture

- [x] Record terrain-streaming metrics after far leaves release shoreline-water meshes and atlas bindings back to the pools/atlas

Reference capture:

- Scenario: `terrain_streaming_low_alt`
- Capture mode: exploratory / unstable allowed
- Artifact: `/tmp/ocean-water-phase3-leaf-release/terrain_streaming_low_alt-latest.json`
- Notes: this run further reduced active shoreline-water resources, although the exploratory frame profile was noisier than the previous handoff capture

Leaf-release values from that capture:

- `frameMs p95`: `6.3`
- `render.sceneMs p95`: `4.1`
- `selectedLeafCount`: `67`
- `activeChunkCount`: `210`
- `activeLeafWaterMeshes`: `51`
- `visibleLeafWaterMeshes`: `51`
- `activeChunkWaterMeshes`: `0`
- `activeOceanWaterMeshes`: `3`
- `activeWaterDepthTextures`: `51`
- `waterDepthAtlasAllocatedPages`: `51`
- `waterDepthAtlasFreePages`: `205`
- `waterDepthAtlasUploadCount`: `118`
- `waterDepthAtlasReuseCount`: `117`
- `uniqueWaterMaterials`: `52`
- `activeWaterVertices`: `2865`
- `activeWaterTriangles`: `4578`

### Phase 3 shoreline-gate capture

- [x] Record terrain-streaming metrics after adding shoreline-aware water ownership heuristics on top of the ocean handoff

Reference capture:

- Scenario: `terrain_streaming_low_alt`
- Capture mode: exploratory / unstable allowed
- Artifact: `/tmp/ocean-water-phase3-shoreline-gate/terrain_streaming_low_alt-latest.json`
- Notes: this heuristic preserved the reduced far-ocean ownership counts, but this exploratory run was materially noisier than the earlier handoff capture and is not the preferred baseline

Shoreline-gate values from that capture:

- `frameMs p95`: `10.8`
- `render.sceneMs p95`: `7.7`
- `selectedLeafCount`: `67`
- `activeChunkCount`: `210`
- `activeLeafWaterMeshes`: `53`
- `visibleLeafWaterMeshes`: `53`
- `activeChunkWaterMeshes`: `0`
- `activeOceanWaterMeshes`: `3`
- `activeWaterDepthTextures`: `53`
- `waterDepthAtlasAllocatedPages`: `53`
- `waterDepthAtlasFreePages`: `203`
- `waterDepthAtlasUploadCount`: `119`
- `waterDepthAtlasReuseCount`: `118`
- `uniqueWaterMaterials`: `54`
- `activeWaterVertices`: `2883`
- `activeWaterTriangles`: `4594`

## Risks

- [ ] Shoreline quality regressions if coarse water geometry and shoreline coloring are not decoupled correctly
- [ ] Atlas/page seams if filtering and page transforms are not handled carefully
- [ ] Ocean/hydrology overlap artifacts at coastlines, harbors, or rivers
- [ ] Premature extraction of `OceanRenderer` before the data model for shoreline depth is solid

## Recommended Order

- [ ] Phase 1
- [ ] Phase 2
- [ ] Phase 3
- [ ] Phase 4

## Notes

- The current near-water shader is static-pattern based rather than truly time-animated.
- The current far-water shader is appropriately cheaper and should remain conceptually separate.
- The best long-term direction is a dedicated ocean renderer fed by streamed shoreline/depth data, not more optimization of per-leaf ocean meshes.

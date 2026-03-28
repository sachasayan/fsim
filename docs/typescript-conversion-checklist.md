# TypeScript Conversion Checklist

## Goal

- [ ] Introduce TypeScript incrementally without breaking the current editor, sim runtime, or test flows.
- [ ] Establish a repeatable migration workflow that lets us convert files in small, verifiable batches.
- [ ] Prioritize high-leverage type coverage in shared editor and runtime boundaries before large orchestrator files.
- [ ] Tighten compiler settings over time instead of forcing strictness on day one.
- [x] Treat `.js`/`.jsx` as transitional only: the long-term goal is full `.ts`/`.tsx` conversion, not permanent JSDoc-checked JavaScript.

## Current Baseline

- [x] Confirm the repo is still primarily JavaScript and JSX.
- [x] Confirm there is no existing `tsconfig.json` or TypeScript compiler setup.
- [x] Confirm the editor uses Vite via `vite.editor.config.mjs`.
- [x] Confirm test coverage currently runs through Node's built-in test runner and Playwright.
- [x] Identify likely high-risk conversion areas: the central sim bootstrap, worker boundaries, and terrain/world modules.

### Inventory Notes

- [x] Current app code is mostly under `js/`, with the editor entry now moved from `src/editor-app/main.jsx` to `src/editor-app/main.ts`.
- [x] The codebase currently contains roughly 122 `js/jsx` files under `js/`.
- [x] The largest module cluster is `js/modules/world`.
- [x] The main runtime bootstrap lives in `js/modules/sim.js`.
- [x] The editor already has a useful migration seam through `src/editor-app/main.jsx` into `js/editor/`.

## Phase 0: Add TypeScript Tooling Safely

- [x] Add `typescript` as a development dependency.
- [x] Create a minimal `tsconfig.json`.
- [x] Add a `typecheck` script to `package.json`.
- [x] Configure TypeScript for incremental adoption.
- [x] Set `allowJs` to `true`.
- [x] Set `checkJs` to `false` initially.
- [x] Set `noEmit` to `true`.
- [x] Include editor, runtime, and test paths in compiler coverage.
- [x] Confirm the existing editor build still works after adding compiler config.

### Phase 0 Notes

- [x] Start with one shared `tsconfig.json` and revisit folder-specific configs later if the migration needs them.
- [x] Keep Playwright config and other Node/tooling entrypoints in JavaScript for now, but bring them under `@ts-check` once Node ambient types are installed.
- [x] Keep `checkJs` off initially so converted `.ts/.tsx` files can be verified without surfacing the entire legacy JS backlog at once.
- [x] Added `@types/node` and `types: ["node"]` in `tsconfig.json` once the migration expanded `@ts-check` coverage to the server and Playwright/test harness files.

## Phase 1: Establish a Safe Editor Beachhead

- [x] Convert `src/editor-app/main.jsx` to TypeScript.
- [x] Convert `js/editor/index.js` if it remains a thin boundary.
- [x] Verify Vite resolves `.ts` and `.tsx` entrypoints correctly.
- [ ] Keep the initial surface area small enough that build failures are easy to diagnose.
- [x] Add any missing ambient declarations needed for editor bootstrapping.

### First Slice Candidates

- [x] `src/editor-app/main.jsx`
- [x] `js/editor/index.js`
- [ ] Any small helper modules directly imported by the editor entrypoint

## Phase 2: Type the Editor Data Model First

- [x] Define shared types for editor document entities.
- [x] Define shared types for selection and tool state.
- [x] Define shared types for the editor store shape.
- [x] Define shared types for controller actions and command payloads.
- [x] Start converting editor core modules before broad React component conversion.

### Core Files To Target

- [x] `js/editor/core/document.js` -> `js/editor/core/document.ts`
- [x] `js/editor/core/store.js` -> `js/editor/core/store.ts`
- [x] `js/editor/core/commands.js` -> `js/editor/core/commands.ts`

### Desired Outcome

- [ ] The editor UI can consume typed document and store APIs instead of inferring shapes ad hoc.
- [ ] Shared types reduce duplication before component-by-component conversion begins.

### Phase 2 Notes

- [x] Introduced `js/editor/core/types.ts` as the first shared editor type seam.
- [x] Added declaration files for `document.js`, `store.js`, and `commands.js` so TypeScript consumers can get typed editor-core APIs before those runtime modules are renamed.
- [x] Added discriminated command and store-action types for the current editor-core surface so future `.ts/.tsx` consumers can use typed dispatch and command payloads.
- [x] Kept the runtime-facing core modules in `.js` temporarily while Node tests and direct imports still depended on a non-TS execution boundary.
- [x] Added a JSDoc-first `@ts-check` pass to `js/editor/core/document.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/editor/core/commands.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/editor/core/store.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Renamed `js/editor/core/document.js`, `js/editor/core/store.js`, and `js/editor/core/commands.js` to `.ts` after the unit-test boundary moved to `tsx --test`, then removed the temporary declaration shims for those modules.
- [x] Verified the editor-core rename batch end-to-end with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).

## Phase 3: Convert Editor React Components in Batches

- [x] Convert shared UI primitives and common helpers first.
- [x] Convert mostly presentational panels before state-heavy panels.
- [x] Convert the top-level editor command/status controls before deeper inspector/detail panels.
- [x] Convert the top-level `EditorApp` after the underlying prop and state types exist.
- [ ] Keep each conversion batch small enough to validate with a build and targeted manual smoke check.

### Suggested Batch Order

- [x] `js/editor/ui/components/ui/*`
- [x] `js/editor/ui/common.jsx`
- [x] Simple stateless panels and utility components
- [x] Stateful panels that consume store/controller state
- [x] `js/editor/ui/app.jsx`

### Validation For Each Batch

- [x] Run the editor build.
- [ ] Verify the editor loads.
- [ ] Smoke test the affected panel or workflow.
- [x] Re-run `typecheck` after any TS selector/prop inference fixes before considering a batch done.

### Phase 3 Notes

- [x] Converted `js/editor/ui/utils.js` to `js/editor/ui/utils.ts`.
- [x] Converted `js/editor/ui/common.jsx` to `js/editor/ui/common.tsx`.
- [x] Updated editor UI imports to consume the new shared TS helper layer.
- [x] Typed `useStore()` against the shared editor store declarations so TS-aware consumers get typed state selection.
- [x] Verified this batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Converted a first presentational panel batch: `AppHeader`, `AirportToolPanel`, `TerrainBrushPanel`, `ToolPalette`, and `FooterPanel`.
- [x] Converted a second editor-control batch: `Toast`, `LayersDropdown`, and `CommandStrip`.
- [x] Converted the top-level editor shell component: `js/editor/ui/app.tsx`.
- [x] Converted another editor UI batch: `ObjectToolPanel` and `ShortcutHelpModal`.
- [x] Converted `js/editor/ui/InspectorPanel.tsx`.
- [x] Converted `js/editor/ui/TerrainLabPanel.tsx`.
- [x] Verified the inspector/detail-layer batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Converted the editor UI primitive component set under `js/editor/ui/components/ui/*`.
- [x] Verified the primitive component batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Converted the remaining editor UI tail by moving `js/editor/ui/LayersPanel.jsx` to `js/editor/ui/LayersPanel.tsx`, `js/editor/ui/StatusBar.jsx` to `js/editor/ui/StatusBar.tsx`, and `js/editor.js` to `js/editor.ts`, then updated the remaining imports and the direct browser editor entrypoint.

### Phase 3 Follow-Up Notes

- [x] Added type predicate declarations for `js/modules/editor/objectTypes.js` so TS components can narrow editor entity variants without rewriting the runtime helper module first.
- [x] Verified the `EditorApp` and follow-on UI batches with both `npm run typecheck` and `npm run editor:build`.
- [x] Verified the second editor-control batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Tightened the shared terrain generator config type in `js/editor/core/types.ts` so `TerrainLabPanel.tsx` could use the nested config shape directly instead of relying on repeated local casts.

## Phase 4: Convert Low-Risk Runtime and Utility Modules

- [ ] Convert isolated helpers with well-bounded inputs and outputs before central orchestration files.
- [x] Convert a first low-risk runtime/helper batch to establish the post-editor migration pattern.
- [ ] Introduce shared runtime/domain types only where they reduce repetition.
- [ ] Avoid pulling large world modules into scope until helper types are already in place.

### Good Early Runtime Candidates

- [x] `js/modules/core/logging.js`
- [x] `js/modules/ui/MapColors.js`
- [x] `js/modules/world/config.js`
- [x] `js/modules/world/WorldConfig.js`
- [x] `js/modules/physics/PhysicsUtils.js`
- [ ] Other small utility or config-style modules with minimal browser-global coupling

### Phase 4 Notes

- [x] Converted `js/modules/core/logging.ts` as the first low-risk runtime helper and updated JS consumers to use extensionless imports so the helper can stay usable from both JS and TS files.
- [x] Converted `js/modules/ui/MapColors.ts` as the first pure runtime utility and tightened its color-array return type to a fixed RGB tuple.
- [x] Converted `js/modules/world/config.ts` and `js/modules/world/WorldConfig.ts` as a small constant/config batch and updated the broad set of JS/TS consumers to use extensionless imports.
- [x] Converted `js/modules/world/AirportLayout.ts` as the first bounded world-domain helper after the config/constants batch, keeping the JS callers stable through extensionless imports.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/MapDataUtils.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Converted `js/modules/world/AuthoredObjectCatalog.ts` as a small pure catalog/normalization module and updated editor/runtime callers to use extensionless imports.
- [x] Converted `js/modules/world/apron.ts` as a small Three.js airport rendering helper, using direct library types and a narrow argument contract instead of widening the whole airport system.
- [x] Converted `js/modules/world/radar.ts` as another isolated airport rendering helper, reusing the typed airport config and the same narrow LOD argument pattern as `apron.ts`.
- [x] Converted `js/modules/world/LodSystem.ts` as a shared runtime helper and updated world/runtime callers to use extensionless imports, strengthening a central LOD contract before larger renderer modules.
- [x] Converted `js/modules/world/hangar.ts` as the first slightly heavier airport renderer and aligned it with the current typed config shape by using `yawDeg` instead of the stale `angle` field.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/runway.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/airports.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a final JSDoc-first cleanup sweep across the remaining native-browser JS companion/runtime tail, covering `js/modules/core/logging.js`, `js/modules/ui/MapColors.js`, `js/modules/world/AirportLayout.js`, `js/modules/world/AuthoredObjectCatalog.js`, `js/modules/world/LodSystem.js`, `js/modules/world/WorldConfig.js`, `js/modules/world/config.js`, `js/modules/noise.js`, and `js/modules/world/aircraft_breakup.js`, and verified the batch with both `npm run typecheck` and `npm run editor:build`.

## Phase 5: Type Worker and Terrain/World Boundaries

- [ ] Define explicit worker request and response message types.
- [x] Convert low-risk editor canvas worker managers after their message contracts are typed locally.
- [x] Convert the first editor canvas worker implementations with typed payload parsing and results.
- [ ] Convert worker managers after their message contracts are typed.
- [ ] Convert worker implementations with typed payload parsing and typed results.
- [ ] Expand shared terrain/world types carefully to avoid large circular dependencies.

### Priority Files

- [x] `js/modules/world/terrain/TerrainWorkerManager.js`
- [x] `js/modules/world/terrain/TerrainWorker.js`
- [x] `js/modules/world/terrain.js`
- [x] `js/modules/world/CloudWorker.js`
- [ ] Other worker-backed terrain modules

### Key Risks To Watch

- [ ] Browser worker typings and transferable payloads
- [ ] Large nested data structures for terrain generation
- [ ] Implicit cross-module contracts in world and terrain systems

### Phase 5 Notes

- [x] Converted `js/editor/canvas/EditorMapTileWorkerManager.ts` and `js/editor/canvas/TerrainPreviewWorkerManager.ts` as the first canvas-side worker boundary batch.
- [x] Converted `js/editor/canvas/EditorMapTileWorker.ts` and `js/editor/canvas/TerrainPreviewWorker.ts` to TypeScript and updated the worker-manager URLs to keep the manager/worker boundary aligned after the renames.
- [x] Added a JSDoc-first `@ts-check` pass to `js/editor/canvas/render.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added shared terrain-preview, terrain-region hover/selection, and terrain metadata types to `js/editor/core/types.ts` so the canvas controller and UI can stop depending on `unknown` for those editor-owned state seams.
- [x] Added a JSDoc-first `@ts-check` pass to `js/editor/canvas/controller.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the next editor-canvas rename batch by moving `js/editor/canvas/controller.js` to `js/editor/canvas/controller.ts`, `js/editor/canvas/render.js` to `js/editor/canvas/render.ts`, and the remaining `js/editor/canvas/TerrainPreviewWorkerManager.js` source to `js/editor/canvas/TerrainPreviewWorkerManager.ts`, then removed the temporary `js/editor/canvas/controller.d.ts` bridge.
- [x] Verified the editor-canvas rename batch with `npm run typecheck`, `npm run editor:build`, and targeted unit coverage around `MapTileManager` concurrency plus the renamed controller/render helpers.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/terrain/TerrainRegions.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/terrain/TerrainUtils.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/terrain/TerrainGeneration.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/terrain/TerrainWorker.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/terrain/TerrainWorkerManager.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/terrain.js`, typed its public terrain-system contract first, then tightened local browser-global, physics-state, and generation-context adapters until both `npm run typecheck` and `npm run editor:build` passed again.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/CloudWorker.js` and a matching helper pass to `js/modules/world/cloudNoise.js`, typing the cloud worker request/result payloads and transfer-ready tile arrays, and verified the batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Added JSDoc-first `@ts-check` passes across the terrain shader/material support slice, covering `ShaderLibrary.js`, `TerrainMaterials.js`, `TerrainOwnedShaderSource.js`, `TerrainPalette.js`, `TerrainPropOwnedShaderSource.js`, `TerrainShaderPatches.js`, `TerrainSurfaceWeights.js`, `TerrainTextures.js`, and `WaterOwnedShaderSource.js`, then aligned the shared option-object contracts between the owned-source builders and shader-patch helpers, and verified the folder batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the terrain shader/material support rename batch by moving `ShaderLibrary.js`, `TerrainMaterials.js`, `TerrainOwnedShaderSource.js`, `TerrainPalette.js`, `TerrainPropOwnedShaderSource.js`, `TerrainShaderPatches.js`, `TerrainSurfaceWeights.js`, `TerrainTextures.js`, and `WaterOwnedShaderSource.js` to `.ts`.
- [x] Verified the renamed terrain shader/material support batch with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Added JSDoc-first `@ts-check` passes across the next terrain support folder slice, covering `BuildingSpawner.js`, `CityChunkLoader.js`, `QuadtreeSelectionController.js`, `RoadMarkingOverlay.js`, `RoadNetworkGeometry.js`, and `TerrainEdits.js`, then typed the loader's browser-global runtime window seam directly instead of widening the rest of the batch, and verified the folder batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the terrain support rename batch by moving `BuildingSpawner.js`, `CityChunkLoader.js`, `QuadtreeSelectionController.js`, `RoadMarkingOverlay.js`, `RoadNetworkGeometry.js`, and `TerrainEdits.js` to `.ts`.
- [x] Verified the renamed terrain support batch with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/terrain/TerrainSynthesis.js`, then formalized the top-level synthesizer options contract around the real runtime runway-flattening world-data shape instead of forcing it through the narrower editor-world type, and verified the batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the terrain core/runtime rename batch by moving `TerrainRegions.js`, `TerrainUtils.js`, `TerrainGeneration.js`, `TerrainSynthesis.js`, `TerrainWorker.js`, and `TerrainWorkerManager.js` to `.ts`.
- [x] Verified the renamed terrain core/runtime batch with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Captured the main rename lesson from the terrain core batch: large JSDoc-heavy runtime files usually need their comment-only option/resource typedefs promoted into real TS aliases, plus explicit class fields for stateful helpers like quadtree samplers, before the final `.ts` rename will settle cleanly.
- [x] Fixed a newly exposed execution-boundary bug in `js/editor/canvas/EditorMapTileWorkerManager.ts` by replacing `window.setTimeout` with `globalThis.setTimeout`, so the manager works under both browser execution and the new TS-aware Node unit-test runner.
- [ ] Decide when to extract shared worker request/response types instead of keeping local worker-message shapes inside each manager.

## Phase 6: Convert Large Orchestrator Files Late

- [x] Leave the central bootstrap/orchestration files until imported modules and shared types are in place.
- [x] Convert `js/modules/sim.js` only after major runtime dependencies have better type coverage.
- [x] Use the late-stage conversion to shrink implicit globals and undocumented contracts.

### Late-Stage Targets

- [x] `js/modules/sim.js`
- [ ] Large world assembly/orchestration modules
- [ ] Any file that currently acts as a catch-all integration layer

### Phase 6 Notes

- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/objects.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/ShaderWarmup.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/WorldLodManager.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/ShaderVariantRegistry.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/clouds.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/authoredObjects.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/tokens.js` and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added JSDoc-first `@ts-check` passes to `js/modules/world/particles.js` and `js/modules/world/environment.js` together and verified the batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/world/aircraft.js`, typing the GLTF-loading, hinge-group, marker-light, and breakup-piece boundaries locally, and verified it with both `npm run typecheck` and `npm run editor:build`.
- [x] Added JSDoc-first `@ts-check` passes across the full `js/modules/world/shaders/` folder, covering `OwnedShaderSourceBuilder.js`, `ShaderPatchUtils.js`, `MaterialShaderPipeline.js`, `ShaderDescriptor.js`, `RunwayShaderPatches.js`, `CloudShaderPatches.js`, `RunwayOwnedShaderSource.js`, and `CloudOwnedShaderSource.js`, and verified the folder batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the `js/modules/world/shaders/` rename batch by moving `OwnedShaderSourceBuilder.js`, `ShaderPatchUtils.js`, `MaterialShaderPipeline.js`, `ShaderDescriptor.js`, `RunwayShaderPatches.js`, `CloudShaderPatches.js`, `RunwayOwnedShaderSource.js`, and `CloudOwnedShaderSource.js` to `.ts`.
- [x] Verified the renamed `js/modules/world/shaders/` batch with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Added JSDoc-first `@ts-check` passes across the full `js/modules/core/` folder runtime surface, covering `InputHandler.js`, `LiveReload.js`, `PostProcessingStack.js`, `RendererManager.js`, `WeatherManager.js`, and `PerformanceCollector.js`, and verified the folder batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the `js/modules/core/` rename batch by moving `InputHandler.js`, `LiveReload.js`, `PostProcessingStack.js`, `RendererManager.js`, `WeatherManager.js`, and `PerformanceCollector.js` to `.ts`, while intentionally leaving `js/modules/core/logging.js` in place as the native-browser companion entrypoint for the already-converted `logging.ts`.
- [x] Verified the renamed `js/modules/core/` batch with `npm run typecheck`, `npm run editor:build`, and focused unit coverage for `WeatherManager`, `PostProcessingStack`, and the async `MapTileManager` concurrency path.
- [x] Added JSDoc-first `@ts-check` passes across the full `js/modules/physics/` folder, covering `PhysicsUtils.js`, `AeroSolver.js`, `GroundPhysics.js`, `rapierWorld.js`, `physicsAdapter.js`, and `updatePhysics.js`, and verified the folder batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the `js/modules/physics/` rename batch by moving `PhysicsUtils.js`, `AeroSolver.js`, `GroundPhysics.js`, `rapierWorld.js`, `physicsAdapter.js`, and `updatePhysics.js` to `.ts`.
- [x] Verified the renamed `js/modules/physics/` batch with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Added JSDoc-first `@ts-check` passes across the full `js/modules/editor/` folder, covering `constants.js`, `geometry.js`, `layers.js`, `objectTypes.js`, and `terrainEdits.js`, then aligned the remaining controller call sites with the broader helper contracts, and verified the folder batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the `js/modules/editor/` rename batch by moving `constants.js`, `geometry.js`, `layers.js`, `objectTypes.js`, and `terrainEdits.js` to `.ts`, then removed the temporary `js/modules/editor/objectTypes.d.ts` bridge once the module owned real TS type guards and exports directly.
- [x] Verified the renamed `js/modules/editor/` folder end-to-end with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Added JSDoc-first `@ts-check` passes across the app-shell support slice around the bootstrap, covering `js/modules/ui/LoaderTips.js`, `js/modules/ui/MapTileManager.js`, `js/modules/ui/hud.js`, `js/modules/camera/updateCamera.js`, `js/modules/state.js`, and `js/modules/lighting.js`, then aligned the remaining async tile-render and DOM/canvas boundary call sites, and verified the batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the app-shell support rename batch by moving `js/modules/ui/LoaderTips.js`, `js/modules/ui/MapTileManager.js`, `js/modules/ui/hud.js`, `js/modules/camera/updateCamera.js`, `js/modules/state.js`, and `js/modules/lighting.js` to `.ts`, while intentionally leaving `js/modules/ui/MapColors.js` in place as the native-browser companion entrypoint for `MapColors.ts`.
- [x] Verified the renamed app-shell support batch with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Added JSDoc-first `@ts-check` passes across the remaining pre-bootstrap support slice, covering `js/modules/sim/AirportSystems.js`, `js/modules/audio/AudioSystem.js`, and `js/modules/crash/CrashSystem.js`, and verified the batch with both `npm run typecheck` and `npm run editor:build`.
- [x] Completed the remaining pre-bootstrap support rename batch by moving `js/modules/sim/AirportSystems.js`, `js/modules/audio/AudioSystem.js`, and `js/modules/crash/CrashSystem.js` to `.ts`.
- [x] Verified the renamed pre-bootstrap support batch with `npm run typecheck`, `npm run editor:build`, and `npm run test:unit` (269 passing tests).
- [x] Restored native-browser runtime compatibility for shared converted helpers by adding `.js` companion modules for `logging`, `LodSystem`, `config`, `AirportLayout`, `AuthoredObjectCatalog`, `WorldConfig`, and `MapColors`, and by updating direct-runtime JS imports to use explicit `.js` specifiers.
- [x] Added a JSDoc-first `@ts-check` pass to `js/modules/sim.js`, typed the owned browser-global/runtime-window seam plus loader and warmup diagnostics, then tightened a small set of compatibility casts at legacy physics, HUD, crash, and live-reload boundaries, and verified the bootstrap with both `npm run typecheck` and `npm run editor:build`.

## Phase 7: Tighten Compiler Strictness Gradually

- [x] Turn on stronger compiler checks only after enough code has moved onto typed seams.
- [ ] Evaluate enabling `checkJs` for selected folders once the migration stabilizes.
- [ ] Evaluate enabling `noImplicitAny`.
- [ ] Evaluate stronger nullability checks where practical.
- [x] Keep strictness changes incremental and tied to real cleanup progress.
- [x] Make the remaining execution boundaries TypeScript-aware so the last large `.js` modules can actually be renamed instead of staying as checked JS.

### Phase 7 Notes

- [x] When renaming class-heavy JS modules like `MapTileManager`, plan to convert JSDoc-only instance state into explicit class fields and exported TS aliases first; otherwise the rename mostly turns into member-inference errors.
- [x] When renaming shared runtime state modules like `state.ts`, widen the owned runtime contracts up front for real integration writes such as `AIRCRAFT.movableSurfaces` and `PHYSICS.heading` instead of letting downstream bootstraps patch around narrow inferred shapes.
- [x] Browser-API compatibility shims like Safari's `webkitAudioContext` usually need a real local window subtype once renamed to TS; JSDoc casts that were tolerated in `.js` stop being enough.
- [x] Small rendering/system helpers like `AirportSystems.ts` often need explicit generic collections after rename, otherwise inferred `Set` contents fall back to `unknown` and hide valid instance-level fields like `instanceColor`.
- [x] Once a JSDoc-heavy folder is renamed for real, the last compile errors are often just “phantom typedef” fallout: local `@typedef` names and window adapters that worked in checked JS need to become actual TS aliases before the folder settles.
- [x] Large rename batches can surface unrelated timing-sensitive tests; when the product code is green under `typecheck` and build, prefer hardening the flaky test to wait for the real completion condition instead of baking in scheduler assumptions.
- [x] Folder batches get cheaper once the shared pipeline they depend on is already renamed; after `world/shaders/` moved to TS, the terrain-owned shader/material slice crossed over with almost no implementation churn.
- [x] Terrain support batches tend to expose two repeatable rename chores: browser-global adapters like `window.fsimWorld` need to become real TS aliases, and stateful overlay/helper classes need explicit field declarations once they stop relying on JSDoc property inference.
- [x] The sim runtime now has a matching Vite boundary alongside the editor: `src/sim-app/`, `vite.sim.config.mjs`, `npm run sim:build`, and `npm run sim:vite` give the main runtime a TS-aware build lane without removing the legacy `fsim.html` fallback in the same step.
- [x] Updated `server.js` and `tools/dev-server.mjs` to prefer `sim-dist/index.html` for `/` and `/fsim.html` when a built sim exists, while still falling back to the legacy root `fsim.html` so the migration can stay incremental.
- [x] New build-boundary pattern: once a direct-browser runtime gets a Vite entrypoint, keep the old HTML entry as a temporary fallback until the first built path has passed `typecheck`, a real build, and the local smoke flow.

### Strictness Strategy

- [ ] Avoid enabling full strict mode globally at the start.
- [ ] Tighten settings in response to progress, not aspiration.
- [ ] Prefer eliminating recurring categories of type holes over chasing one-off warnings.
- [x] Added the first strictness-adjacent batch by bringing `server.js`, `playwright.config.js`, the editor Playwright helpers/specs, the perf Playwright specs, `js/vendor/react-loader.js`, and the remaining editor-canvas JS helpers under `@ts-check`, then added Node ambient types so those files could stay checked without being rewritten first.
- [x] Declared the final migration intent explicitly: checked JS is now only a staging step, and future phases should optimize for removing `.js`/`.jsx` files rather than treating `@ts-check` coverage as the finish line.
- [x] Started the first execution-boundary upgrade for full conversion by switching the unit-test runner from `node --test` to `tsx --test`, so future `.ts` module renames are not blocked by direct Node imports in the unit tests.
- [x] Verified the upgraded unit-test boundary end-to-end: `npm run test:unit` now passes under `tsx --test` (269 passing tests), which means direct Node test imports are no longer a hard blocker for future editor/runtime `.ts` renames.
- [x] Completed the first post-upgrade rename batch by moving `js/editor/core/document.js`, `js/editor/core/store.js`, and `js/editor/core/commands.js` to real `.ts` modules, then removing their temporary `.d.ts` bridge files after the batch went green under `typecheck`, `editor:build`, and `test:unit`.
- [x] Completed the next editor-helper rename batch by moving the full `js/modules/editor/` helper folder to `.ts` modules and deleting the leftover `objectTypes.d.ts` bridge after the renamed helpers exposed real TS type guards and exported aliases.
- [x] Completed the next runtime-helper rename batch by moving the non-companion `js/modules/core/` helpers to `.ts` modules, while explicitly keeping `js/modules/core/logging.js` as a compatibility seam until the direct browser runtime no longer depends on `.js` companion entrypoints.
- [x] Added the first TypeScript-aware sim execution boundary by creating `src/sim-app/index.html` and `src/sim-app/main.ts`, wiring `vite.sim.config.mjs`, and adding `sim:build` / `sim:vite` scripts so the runtime can be built and served without native browser support for `.ts` entrypoints.
- [x] Verified the new sim build boundary with `npm run typecheck`, `npm run sim:build`, and `npm run smoke` (smoke server checks were skipped by the sandbox, but the script still passed).
- [x] Renamed the main sim bootstrap from `js/modules/sim.js` to `js/modules/sim.ts`, then promoted its comment-only runtime-window, loader, terrain-diagnostics, and warmup-progress contracts into real TS aliases so the bootstrap could settle cleanly under the new sim build boundary.
- [x] Updated `src/sim-app/main.ts` and the smoke checks to stop depending on the legacy raw `/js/modules/sim.js` URL and instead validate the built sim entry flow.
- [x] Verified the renamed sim bootstrap with `npm run typecheck`, `npm run sim:build`, `npm run smoke`, and `npm run test:unit` (269 passing tests).
- [x] New bootstrap-rename pattern: once the main runtime entry moves to TS, the remaining work is usually not domain logic but “phantom JSDoc” cleanup around owned globals, loader state, and progress callbacks that already had stable shapes in practice.

## Batch Workflow

- [ ] Define or refine shared types first.
- [x] Rename only a small cluster of files in each batch.
- [x] Run the relevant build and tests after each batch.
- [x] Fix surfaced type holes before moving on.
- [x] Document notable migration blockers or patterns discovered during each batch.

## Decision Log

- [x] Prefer `rename-first` when the execution boundary already supports TypeScript, and use `JSDoc-first` only as a staging step where native runtime/test boundaries still block renames.
- [x] Default recommendation: `rename-first` for the editor path once the direct Node test imports are moved behind a TS-aware runner.
- [x] Default recommendation: `JSDoc-first` only for very large runtime modules where renaming immediately would create too much churn or where the runtime still loads native `.js` directly.
- [x] Keep tooling files such as `playwright.config.js` in JavaScript for now, but under `@ts-check`, unless a later toolchain cleanup makes `.ts` the simpler option.
- [ ] Decide whether to add folder-specific tsconfigs later for editor/runtime separation.
- [x] For editor core modules that are still imported directly as `.js` by Node tests or runtime code, use declaration-first typing before file renames.
- [x] Once an execution boundary is TS-aware, finish the transition by renaming the staged `.js` module to `.ts` and deleting any temporary `.d.ts` bridge files instead of leaving declaration-first typing in place indefinitely.

## Recommended Next Slice

- [x] Add TypeScript tooling and a baseline `typecheck` script.
- [x] Add a minimal `tsconfig.json` configured for incremental adoption.
- [x] Convert `src/editor-app/main.jsx` to `main.ts` or `main.tsx` as appropriate.
- [x] Inspect `js/editor/index.js` and convert it only if the boundary remains thin.
- [ ] Introduce the first shared editor/store/document types needed to support that slice.

## Progress Notes

- [x] Captured the first batch: TypeScript dependency, baseline `tsconfig.json`, `typecheck` script, and editor entrypoint conversion to `src/editor-app/main.ts`.
- [x] Updated `src/editor-app/index.html` to point at `main.ts`.
- [x] `js/editor/index.js` initially stayed deferred because it was larger than the first safe rename boundary.
- [x] Converted `js/editor/index.js` to `js/editor/index.tsx` after the editor UI shell and controller contract had enough typed seams around it.
- [x] Added `js/editor/canvas/controller.d.ts` so the browser bootstrap can depend on a typed controller contract without converting the controller implementation yet.
- [x] First build-system surprise: TypeScript needed an ambient `declare module '*.css'` file for the editor entrypoint side-effect stylesheet import.
- [x] Second migration constraint: several editor core modules are executed directly as `.js`, so declaration-first typing is the safest next step before wider file renames.
- [x] That editor-core constraint is now partially retired: after the unit-test runner moved to `tsx`, the first staged editor-core modules were able to rename cleanly to `.ts`.
- [x] Third migration pattern: prefer extensionless imports when moving editor UI helpers to TS so Vite and TypeScript agree on resolution without enabling TS-extension imports.
- [x] Fourth migration pattern: when `useStore()` selectors plus `shallowEqual` lose inference, add an explicit generic at the call site instead of weakening the shared store types.
- [x] Fifth migration pattern: when a converted child component requires a real prop contract, tighten the nearest TSX parent boundary instead of loosening the child prop type back to `unknown`.
- [x] Sixth migration pattern: declaration files for existing JS type guards can unlock large TSX conversions by giving TypeScript real narrowing behavior without converting the helper module yet.
- [x] Seventh migration pattern: when a large TSX component depends on a nested config object, tighten the shared domain type once in `core/types.ts` instead of repeating local casts throughout the component.
- [x] Eighth migration pattern: Radix and `cva` wrapper components can usually move straight to TSX with library-provided prop/ref types, without requiring tsconfig or build changes.
- [x] Ninth migration pattern: if a converted browser entry starts rendering JSX directly, promote it to `.tsx` immediately rather than fighting syntax errors in `.ts`.
- [x] Tenth migration pattern: for core JS modules under `@ts-check`, shared typedef imports plus explicit per-branch narrowing are usually enough to make the implementation type-safe without a full rename.
- [x] Eleventh migration pattern: command/mutation modules often need explicit tuple and point-array casts at the write sites, even when the surrounding entity narrowing is already typed.
- [x] Twelfth migration pattern: reducer-style store modules often need explicit casts only at the deepest dynamic-update points, such as nested path writes, while the rest of the switch can stay strongly typed through the shared action/state contracts.
- [x] Thirteenth migration pattern: small browser worker managers are a good first canvas/runtime seam because they can move to `.ts` with local message and pending-job types before the larger controller or worker implementation files are ready.
- [x] Fourteenth migration pattern: once a worker manager is in TypeScript, renaming the paired worker implementation is usually cheapest in the next batch because the `new URL(...)` entrypoint needs to stay aligned with the source file rename anyway.
- [x] Fifteenth migration pattern: large render-layer canvas files respond well to `@ts-check` plus explicit group-based type-guard narrowing, because most of the dynamic behavior already follows layer-group conventions even when the shared store fields are still loose.
- [x] Sixteenth migration pattern: before putting `@ts-check` on a large controller file, it helps to pull any controller-owned `unknown` state blobs into shared editor types first; once those seams are named, the remaining controller errors are usually local event or narrowing issues instead of cross-file shape ambiguity.
- [x] Seventeenth migration pattern: for small runtime helpers that are imported from both JS and TS files, extensionless imports are the easiest way to rename the helper to `.ts` without forcing the surrounding JS modules to convert in the same batch.
- [x] Eighteenth migration pattern: small config/constant modules are worth converting in pairs when they are widely imported together, because the import-update churn is mostly the same whether we rename one shared constant file or two.
- [x] Nineteenth migration pattern: once a config module is typed, the next safest world helper is usually the one that mostly composes those constants and pure geometry transforms, because it adds domain typing without dragging rendering or Three.js-heavy code into the same batch.
- [x] Twentieth migration pattern: for mutation-heavy normalization modules, `@ts-check` works best when shared typedefs describe the intended shapes and the remaining arithmetic/array assumptions are made explicit only at the narrowest hot spots.
- [x] Twenty-first migration pattern: small catalog modules with normalization helpers are good rename-first candidates even in runtime code, because they centralize stable lookup data and usually only need typed defaults plus a few narrow consumer import updates.
- [x] Twenty-second migration pattern: very small Three.js helpers can often go straight to `.ts` once their config inputs are typed, as long as the function boundary gets an explicit argument contract and we avoid pulling unrelated scene systems into the same batch.
- [x] Twenty-third migration pattern: once one tiny rendering helper in a feature area converts cleanly, adjacent helpers with the same dependency profile are often cheap follow-up wins because the input-contract pattern is already established.
- [x] Twenty-fourth migration pattern: after a few leaf helpers convert cleanly, it’s often worth converting the shared helper they all depend on next, because one import-update batch can strengthen many later runtime conversions at once.
- [x] Twenty-fifth migration pattern: once config types are authoritative, converting medium-sized helpers can also flush out stale field names in legacy code; letting TypeScript force those alignments is a useful cleanup side effect rather than churn to avoid.
- [x] Twenty-sixth migration pattern: larger renderer modules with lots of canvas work and shader hookups can still be good `@ts-check` candidates when the surrounding config/helper seams are already typed, because many of the remaining risks are just nullability and argument-contract issues rather than deep domain ambiguity.
- [x] Twenty-seventh migration pattern: as larger JS modules move under `@ts-check`, typed helper APIs can reveal permissive legacy call shapes; fixing those call sites is useful contract cleanup, not just compiler appeasement.
- [x] Twenty-eighth migration pattern: top-level orchestrator modules become much more tractable once their subsystems are already typed, but they often still need small local aggregate typedefs and narrow compatibility casts at legacy subsystem boundaries.
- [x] Twenty-ninth migration pattern: shared aggregation modules often typecheck cleanly under `@ts-check` once they own their report/progress typedefs, but they still need a few explicit “shape recovery” casts at plugin-style boundaries where registry entries or material metadata are intentionally loose.
- [x] Thirtieth migration pattern: small manager modules around typed helpers can usually be brought under `@ts-check` with one explicit registrable-contract typedef and a narrow `unknown` guard at the registration boundary, without needing to convert every managed subsystem in the same batch.
- [x] Thirty-first migration pattern: once a shared registry starts owning real entry typedefs, the nearby callers should import and reuse those shapes instead of preserving parallel local assumptions, otherwise type drift just moves outward into the aggregation layer.
- [x] Thirty-second migration pattern: medium-sized effect systems with worker generation and shader warmup hooks usually typecheck cleanly once their external boundaries are named explicitly, and the remaining friction is often just annotating callback parameters such as warmup-builder cameras or worker messages.
- [x] Thirty-third migration pattern: world systems that read browser globals can still fit the JSDoc-first path cleanly, but it helps to isolate the global access behind one small typed adapter function instead of repeating `window` casts throughout the module.
- [x] Thirty-fourth migration pattern: gameplay-style systems with rich local state often typecheck quickly once their entry/event/effect records are named up front, and the most common cleanup is converting optional destructured parameters into a defaulted local options object.
- [x] Thirty-fifth migration pattern: once a shared runtime path has enough typed seams around it, we can safely widen the batch size and convert two or three adjacent medium-risk modules together, especially when they only need external-boundary typedefs rather than deep internal refactors.
- [x] Thirty-sixth migration pattern: for codepaths still loaded directly by the browser as native JS modules, renaming a shared helper to `.ts` is not enough by itself; those paths need explicit `.js` import specifiers and real `.js` companion entrypoints until the runtime is fully behind a TS-aware build step.
- [x] Thirty-seventh migration pattern: terrain/editor bridge modules often need two parallel type layers, a loose input shape that matches editor-authored data and a stricter normalized runtime shape; trying to force one type to serve both ends usually creates more friction than value.
- [x] Thirty-eighth migration pattern: terrain support modules with shared runtime caches benefit from typing the cache and metadata seams first, but it’s often better to use narrow call-site casts where those caches feed older helper contracts than to overfit one broad metadata type to every downstream consumer.
- [x] Thirty-ninth migration pattern: terrain generation modules become tractable under `@ts-check` when we type the generation context in slices, such as base-chunk resources, tree resources, and debug toggles, instead of trying to describe the entire terrain runtime context as one giant object up front.
- [x] Fortieth migration pattern: large worker modules respond well to a message-boundary-first pass, where we type the inbound job payloads, outbound results, and a few local record shapes first; once those contracts exist, the remaining errors usually collapse to a small number of specific nested payload fields.
- [x] Forty-first migration pattern: worker managers usually only need one extra step after the worker itself is typed, a small local message envelope cast before branch-based narrowing, because destructuring a discriminated union too early tends to erase the information TypeScript needs.
- [x] Forty-second migration pattern: for monolithic terrain systems, start by typing the returned public contract and constructor options first; that usually flushes the real loose boundaries into a short list of browser-global adapters, physics-state adapters, and one or two downstream caller typedefs instead of forcing a whole-file rewrite.
- [x] Forty-third migration pattern: asset-heavy scene systems often typecheck cleanly with local JSDoc typedefs for GLTF payloads, hinge-group `userData`, and returned system APIs; keeping those shapes local is usually cheaper than introducing shared scene-object types too early.
- [x] Forty-fourth migration pattern: when a worker already has a typed caller on the main-thread side, the cheapest follow-up is often to type the worker implementation and its tiny pure helper together, because the shared payload vocabulary already exists and the remaining fixes tend to be just stale accumulator fields or transfer-array bookkeeping.
- [x] Forty-fifth migration pattern: pure utility folders with shared internal vocabulary, like shader descriptor and patch helpers, are good folder-at-a-time batches; a single consistent layer of local typedefs usually covers the whole directory, and the remaining fixes tend to be helper-generic ergonomics rather than runtime behavior changes.
- [x] Forty-sixth migration pattern: mixed browser-runtime folders can still move folder-at-a-time if we type the smallest boundary-heavy modules first and leave one broader observer/reporting file for last; the remaining cleanup usually collapses to DOM narrowing and browser-only API adapters like `performance.memory`.
- [x] Forty-seventh migration pattern: stateful subsystem folders like `physics/` usually need one shared “broad but practical” state shape to span internal helpers; once that bridge type is wide enough for all cooperating modules, the remaining cleanup is mostly browser-global adapters and input-shape widening rather than algorithm changes.
- [x] Forty-eighth migration pattern: editor bridge/helper folders often need intentionally broader public contracts than their internal logic uses, because the surrounding controller and command layers still pass heterogeneous entity shapes; the cleanest finish is usually to widen the helper boundary and add one or two explicit casts at the call sites that genuinely know more.
- [x] Forty-ninth migration pattern: support rings around a large bootstrap file are strong folder-batch targets because they mostly expose DOM, canvas, and async callback boundaries; once those seams are typed, the remaining fixes are usually local element narrowing and one or two explicit Promise/result casts where a looser caller API still sits between modules.
- [x] Fiftieth migration pattern: once most surrounding support layers are typed, the last pre-bootstrap slices often go green quickly because their dependencies are already constrained; at that stage, local browser/audio/physics typedefs are usually enough, and broad shared runtime types add less value than just finishing the ring around the bootstrap.
- [x] Fifty-first migration pattern: once the dependency ring around a large bootstrap is typed, the bootstrap itself is usually best approached by first naming the globals and diagnostics it owns, then applying a few narrow compatibility casts at older subsystem boundaries; trying to invent one giant shared runtime type up front creates more churn than value at that stage.
- [x] Fifty-second migration pattern: terrain shader/material folders are good large-batch `@ts-check` candidates once the shared shader pipeline is already typed, but they usually need one explicit round of named option-object typedefs so the owned-source builders and shader-patch helpers stop inferring incompatible anonymous object shapes.
- [x] Fifty-third migration pattern: once a terrain support folder is mostly surrounded by typed modules, the remaining errors often collapse to one browser-global seam in a loader or cache file; typing that runtime window locally is usually cheaper and safer than inventing a broader shared global contract for the whole folder.
- [x] Fifty-fourth migration pattern: for large procedural generator modules, the highest-leverage boundary to type is usually the top-level options object, but that contract needs to reflect the runtime data the generator actually consumes; reusing a narrower editor-facing type too early tends to create avoidable friction at helper call sites.
- [x] Fifty-fifth migration pattern: once the major runtime folders are under `@ts-check`, the remaining native-browser JS companion files are worth sweeping in as one batch; they usually go green immediately, and doing them together prevents the migration tracker from looking “done” while the browser-entry fallback layer still sits outside checked coverage.
- [x] Fifty-sixth migration pattern: once the app/runtime code is largely covered, the next best large batch is often the editor/tooling tail; converting the last small TSX stragglers and bringing server/test harness files under `@ts-check` together creates a much cleaner handoff into real compiler-tightening work than leaving those areas as permanent exceptions.
- [x] Fifty-seventh migration pattern: when you make a Node-side execution boundary TypeScript-aware, expect it to expose browser-only global assumptions that were previously hidden; fixing those with `globalThis`-style APIs is usually a real portability improvement, not just test-runner cleanup.
- [x] Fifty-eighth migration pattern: once a staged JS module reaches a TS-aware execution boundary, the real rename usually needs one cleanup pass converting JSDoc-heavy exports into explicit TypeScript signatures, but after that it is cleaner to delete the temporary `.d.ts` bridge immediately than to maintain duplicate type surfaces.
- [x] Fifty-ninth migration pattern: big JS-to-TS canvas renames often fail first on “types that only existed in JSDoc,” so the fastest cleanup is usually to replace those comment-only aliases with real `import type` statements and TS `type` aliases at the same time that the file is renamed.
- [x] Sixtieth migration pattern: when a renamed helper module is supposed to narrow unions for the rest of the app, convert its predicate signatures to explicit TypeScript type guards right away; leaving them as JSDoc-era comments can make downstream TS files look broken even though runtime behavior never changed.
- [x] Sixty-first migration pattern: observer/reporting modules are good rename candidates once their dependencies are stable, but they usually need one “broad snapshot types” pass after the rename; it is faster to name the external snapshot shapes explicitly than to let TypeScript infer a maze of `{}` objects from default callbacks.

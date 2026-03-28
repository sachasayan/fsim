# TypeScript Conversion Checklist

## Goal

- [ ] Introduce TypeScript incrementally without breaking the current editor, sim runtime, or test flows.
- [ ] Establish a repeatable migration workflow that lets us convert files in small, verifiable batches.
- [ ] Prioritize high-leverage type coverage in shared editor and runtime boundaries before large orchestrator files.
- [ ] Tighten compiler settings over time instead of forcing strictness on day one.

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
- [ ] Decide whether Playwright config should stay JavaScript for now or move later with the rest of tooling files.
- [x] Keep `checkJs` off initially so converted `.ts/.tsx` files can be verified without surfacing the entire legacy JS backlog at once.

## Phase 1: Establish a Safe Editor Beachhead

- [x] Convert `src/editor-app/main.jsx` to TypeScript.
- [ ] Convert `js/editor/index.js` if it remains a thin boundary.
- [x] Verify Vite resolves `.ts` and `.tsx` entrypoints correctly.
- [ ] Keep the initial surface area small enough that build failures are easy to diagnose.
- [x] Add any missing ambient declarations needed for editor bootstrapping.

### First Slice Candidates

- [x] `src/editor-app/main.jsx`
- [ ] `js/editor/index.js`
- [ ] Any small helper modules directly imported by the editor entrypoint

## Phase 2: Type the Editor Data Model First

- [x] Define shared types for editor document entities.
- [x] Define shared types for selection and tool state.
- [x] Define shared types for the editor store shape.
- [x] Define shared types for controller actions and command payloads.
- [ ] Convert editor core modules before broad React component conversion.

### Core Files To Target

- [ ] `js/editor/core/document.js`
- [ ] `js/editor/core/store.js`
- [ ] `js/editor/core/commands.js`

### Desired Outcome

- [ ] The editor UI can consume typed document and store APIs instead of inferring shapes ad hoc.
- [ ] Shared types reduce duplication before component-by-component conversion begins.

### Phase 2 Notes

- [x] Introduced `js/editor/core/types.ts` as the first shared editor type seam.
- [x] Added declaration files for `document.js`, `store.js`, and `commands.js` so TypeScript consumers can get typed editor-core APIs before those runtime modules are renamed.
- [x] Added discriminated command and store-action types for the current editor-core surface so future `.ts/.tsx` consumers can use typed dispatch and command payloads.
- [x] Keep the runtime-facing core modules in `.js` for now because they are still loaded directly by Node tests and browser/runtime code without a transpilation layer.

## Phase 3: Convert Editor React Components in Batches

- [x] Convert shared UI primitives and common helpers first.
- [x] Convert mostly presentational panels before state-heavy panels.
- [x] Convert the top-level editor command/status controls before deeper inspector/detail panels.
- [x] Convert the top-level `EditorApp` after the underlying prop and state types exist.
- [ ] Keep each conversion batch small enough to validate with a build and targeted manual smoke check.

### Suggested Batch Order

- [ ] `js/editor/ui/components/ui/*`
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
- [x] Verified the `EditorApp` and follow-on UI batches with both `npm run typecheck` and `npm run editor:build`.
- [x] Verified the second editor-control batch with both `npm run typecheck` and `npm run editor:build`.

## Phase 4: Convert Low-Risk Runtime and Utility Modules

- [ ] Convert isolated helpers with well-bounded inputs and outputs before central orchestration files.
- [ ] Introduce shared runtime/domain types only where they reduce repetition.
- [ ] Avoid pulling large world modules into scope until helper types are already in place.

### Good Early Runtime Candidates

- [ ] `js/modules/core/logging.js`
- [ ] `js/modules/ui/MapColors.js`
- [ ] `js/modules/world/config.js`
- [ ] `js/modules/physics/PhysicsUtils.js`
- [ ] Other small utility or config-style modules with minimal browser-global coupling

## Phase 5: Type Worker and Terrain/World Boundaries

- [ ] Define explicit worker request and response message types.
- [ ] Convert worker managers after their message contracts are typed.
- [ ] Convert worker implementations with typed payload parsing and typed results.
- [ ] Expand shared terrain/world types carefully to avoid large circular dependencies.

### Priority Files

- [ ] `js/modules/world/terrain/TerrainWorkerManager.js`
- [ ] `js/modules/world/terrain/TerrainWorker.js`
- [ ] Other worker-backed terrain modules

### Key Risks To Watch

- [ ] Browser worker typings and transferable payloads
- [ ] Large nested data structures for terrain generation
- [ ] Implicit cross-module contracts in world and terrain systems

## Phase 6: Convert Large Orchestrator Files Late

- [ ] Leave the central bootstrap/orchestration files until imported modules and shared types are in place.
- [ ] Convert `js/modules/sim.js` only after major runtime dependencies have better type coverage.
- [ ] Use the late-stage conversion to shrink implicit globals and undocumented contracts.

### Late-Stage Targets

- [ ] `js/modules/sim.js`
- [ ] Large world assembly/orchestration modules
- [ ] Any file that currently acts as a catch-all integration layer

## Phase 7: Tighten Compiler Strictness Gradually

- [ ] Turn on stronger compiler checks only after enough code has moved onto typed seams.
- [ ] Evaluate enabling `checkJs` for selected folders once the migration stabilizes.
- [ ] Evaluate enabling `noImplicitAny`.
- [ ] Evaluate stronger nullability checks where practical.
- [ ] Keep strictness changes incremental and tied to real cleanup progress.

### Strictness Strategy

- [ ] Avoid enabling full strict mode globally at the start.
- [ ] Tighten settings in response to progress, not aspiration.
- [ ] Prefer eliminating recurring categories of type holes over chasing one-off warnings.

## Batch Workflow

- [ ] Define or refine shared types first.
- [ ] Rename only a small cluster of files in each batch.
- [ ] Run the relevant build and tests after each batch.
- [ ] Fix surfaced type holes before moving on.
- [ ] Document notable migration blockers or patterns discovered during each batch.

## Decision Log

- [ ] Decide whether to prefer `rename-first` or `JSDoc-first` for each area.
- [ ] Default recommendation: `rename-first` for the editor path.
- [ ] Default recommendation: `JSDoc-first` only for very large runtime modules where renaming immediately would create too much churn.
- [ ] Decide when to begin converting tooling files such as `playwright.config.js`.
- [ ] Decide whether to add folder-specific tsconfigs later for editor/runtime separation.
- [x] For editor core modules that are still imported directly as `.js` by Node tests or runtime code, use declaration-first typing before file renames.

## Recommended Next Slice

- [x] Add TypeScript tooling and a baseline `typecheck` script.
- [x] Add a minimal `tsconfig.json` configured for incremental adoption.
- [x] Convert `src/editor-app/main.jsx` to `main.ts` or `main.tsx` as appropriate.
- [ ] Inspect `js/editor/index.js` and convert it only if the boundary remains thin.
- [ ] Introduce the first shared editor/store/document types needed to support that slice.

## Progress Notes

- [x] Captured the first batch: TypeScript dependency, baseline `tsconfig.json`, `typecheck` script, and editor entrypoint conversion to `src/editor-app/main.ts`.
- [x] Updated `src/editor-app/index.html` to point at `main.ts`.
- [x] `js/editor/index.js` remains deferred because it is larger than the first safe rename boundary.
- [x] First build-system surprise: TypeScript needed an ambient `declare module '*.css'` file for the editor entrypoint side-effect stylesheet import.
- [x] Second migration constraint: several editor core modules are executed directly as `.js`, so declaration-first typing is the safest next step before wider file renames.
- [x] Third migration pattern: prefer extensionless imports when moving editor UI helpers to TS so Vite and TypeScript agree on resolution without enabling TS-extension imports.
- [x] Fourth migration pattern: when `useStore()` selectors plus `shallowEqual` lose inference, add an explicit generic at the call site instead of weakening the shared store types.
- [x] Fifth migration pattern: when a converted child component requires a real prop contract, tighten the nearest TSX parent boundary instead of loosening the child prop type back to `unknown`.

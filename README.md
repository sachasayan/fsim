# fsim

`fsim` is a browser-based flight simulation sandbox focused on procedural world generation, a custom offline world-building pipeline, and an in-browser 2D world editor.

The project combines:

- A Three.js-powered flight sim runtime with procedural terrain, weather, lighting, HUD systems, audio, crash handling, and adaptive LOD.
- An authoring workflow built around `tools/map.json`, `config/vantage_points.json`, and a React-based map editor at `/editor`.
- Offline baking tools that compile authored + procedural world data into binary terrain and district chunk assets under [`world/`](./world).
- A testing and performance harness for shader, terrain, editor, and runtime regression coverage.

## Highlights

### Flight sim runtime

- Real-time 3D sim entry point at [`fsim.html`](./fsim.html).
- Simulation orchestration in [`js/modules/sim.js`](./js/modules/sim.js).
- Flight physics and aerodynamics modules under [`js/modules/physics/`](./js/modules/physics).
- Rapier-backed physics adapter for runtime integration.
- Camera, input, HUD, minimap, telemetry, warning overlay, token collection, and crash systems.
- Procedural audio initialization and browser audio-resume handling.

### World and rendering systems

- Procedural terrain generation, terrain synthesis, terrain edits, and quadtree-based terrain streaming.
- Dynamic LOD and world chunk management for terrain, props, and city content.
- Offline-generated district/building chunks loaded at runtime.
- Weather manager, cloud systems, atmospheric tuning, water, lighting, runway, apron, hangar, radar, tower, and airport systems.
- Custom shader ownership/patch pipelines for terrain, runway, water, and clouds.
- Post-processing and renderer management for bloom, SMAA, profiling, and adaptive quality instrumentation.

### World editor and content pipeline

- Dedicated editor entry point at `/editor` (served from [`editor.html`](./editor.html) in fallback mode).
- React-based editor app in [`js/editor/`](./js/editor) with canvas controllers, document/store logic, and UI shell.
- Save flow for map and vantage-point data through the dev server.
- Live reload events for rebuilding and refreshing baked city/world content after edits.
- Authorable world data in [`tools/map.json`](./tools/map.json).

### Tooling, testing, and automation

- Local dev/build server in [`tools/dev-server.mjs`](./tools/dev-server.mjs).
- Static runtime server in [`server.js`](./server.js).
- Offline bake pipeline:
  - [`tools/bake-map.mjs`](./tools/bake-map.mjs) for terrain/quadtree baking.
  - [`tools/build-world.mjs`](./tools/build-world.mjs) for district/chunk compilation.
- Screenshot, smoke, and performance capture scripts in [`scripts/`](./scripts).
- Unit and Playwright coverage for terrain, shaders, weather, physics, editor behavior, performance scenarios, and E2E editor/runtime flows in [`tests/`](./tests).

## Project structure

```text
fsim/
├── fsim.html              # main sim runtime entry
├── editor.html            # fallback browser world editor document, served at /editor
├── js/
│   ├── modules/           # sim, physics, renderer, world, shaders, UI
│   └── editor/            # editor canvas, state, commands, UI
├── tools/
│   ├── dev-server.mjs     # editor-aware dev server + save/rebuild APIs
│   ├── bake-map.mjs       # terrain/quadtree baker
│   ├── build-world.mjs    # district/world chunk compiler
│   └── map.json           # authored world/map definition
├── world/                 # baked binary world outputs
├── scripts/               # smoke, screenshot, perf, utility scripts
├── tests/                 # unit + E2E coverage
├── docs/                  # graphics, terrain, and testing notes
└── models/                # aircraft and related assets
```

## Getting started

### Requirements

- Node.js with npm
- A modern desktop browser

### Install

```bash
npm install
```

### Run the development server

This is the main local workflow. It serves the sim, exposes the editor, supports saving editor changes, and can rebuild world data.

```bash
npm run dev
```

Then open:

- Sim: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- Editor: [http://127.0.0.1:5173/editor](http://127.0.0.1:5173/editor)

### Run the static server

This serves the sim runtime without the editor save/rebuild APIs.

```bash
npm run start
```

## Common commands

```bash
npm run dev
npm run build:world
npm run smoke
npm run test:unit
npm test
npm run test:e2e
npm run test:perf
npm run perf:capture
npm run perf:analyze
npm run screenshot
npm run screenshot:batch
```

## World-building workflow

1. Edit map content in the browser editor or directly in [`tools/map.json`](./tools/map.json).
2. Save changes from the editor, or rebuild manually with:

```bash
npm run build:world
```

3. The bake pipeline writes compiled terrain/chunk outputs into [`world/`](./world).
4. Reload the sim/editor to validate terrain, districts, roads, props, and flight paths.

## Testing

Primary commands are documented in [`docs/testing.md`](./docs/testing.md).

Quick reference:

- `npm run test:unit` for fast deterministic unit coverage
- `npm run smoke` for syntax/basic asset-delivery validation
- `npm run test:e2e` for Playwright flows
- `npm run test:perf` for microbenchmarks
- `npm run perf:capture` and `npm run perf:analyze` for browser-side performance reporting

## Documentation

- [`docs/testing.md`](./docs/testing.md)
- [`docs/graphics-improvements.md`](./docs/graphics-improvements.md)
- [`docs/terrain-generation-plan.md`](./docs/terrain-generation-plan.md)
- [`docs/terrain-cinematic-roadmap.md`](./docs/terrain-cinematic-roadmap.md)
- [`docs/world-asset-pipeline.md`](./docs/world-asset-pipeline.md)

## License

This repository is licensed under the MIT License. See [`LICENSE`](./LICENSE).

Third-party assets and bundled subdirectories may include their own licenses. For example, [`models/737-800-master/LICENSE`](./models/737-800-master/LICENSE) applies to that model package and is not replaced by the root MIT license.

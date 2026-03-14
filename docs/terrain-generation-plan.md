## Terrain generation plan

The terrain bake now has a dedicated offline synthesis stage in
[`js/modules/world/terrain/TerrainSynthesis.js`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainSynthesis.js).

### Current direction

- Keep runtime terrain sampling cheap.
- Move realism work into the offline baker.
- Treat hydrology as authored/generated data, not a live simulation.

### What the first pass does

- Builds macro relief from more than one noise family:
  - continental shelf / broad landmass shaping
  - domain-warped foothills
  - ridged multifractal mountain ranges
  - valley carving
- Builds a coarse hydrology raster offline:
  - samples the macro height field on a fixed grid
  - routes downhill flow to the steepest neighboring cell
  - accumulates drainage
  - traces likely rivers from high-elevation, high-flow cells
  - identifies closed-basin lake candidates
- Feeds the bake step with a single `sampleHeight(x, z)` interface.

### Why this fits fsim

- [`tools/bake-map.mjs`](/Users/sacha/Projects/fsim/tools/bake-map.mjs) already owns terrain baking.
- [`js/modules/world/terrain/TerrainWorker.js`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainWorker.js) already expects cheap baked height sampling.
- [`world/world.bin`](/Users/sacha/Projects/fsim/world/world.bin) already stores JSON metadata, so hydrology features can travel with the terrain bake.

### Known limitations

- Inland lakes are metadata-only for now. The current runtime water system still assumes a global sea level, so lake rendering needs a second pass.
- River carving currently improves terrain shape, but does not yet create dedicated river water meshes/material behavior.
- Hydrology is intentionally coarse and cheap. It is a stepping stone, not full hydraulic erosion.

### Recommended next steps

1. Add runtime support for hydrology metadata:
   - river surface overrides
   - riverbank vegetation placement
   - inland lake water meshes
2. Upgrade the offline hydrology pass:
   - depression filling / breach routing
   - erosion/deposition iterations
   - sediment-informed floodplains
3. Split terrain synthesis outputs into reusable fields:
   - height
   - flow accumulation
   - moisture
   - erosion
   - biome masks

### Follow-up roadmap

For the next round of more dramatic, cinematic terrain work, see
[`docs/terrain-cinematic-roadmap.md`](/Users/sacha/Projects/fsim/docs/terrain-cinematic-roadmap.md).
That roadmap focuses on stronger mountain systems, deeper valleys, canyon formation,
plateaus, and composition-aware landform placement around the airport.

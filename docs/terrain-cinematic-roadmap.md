# Cinematic terrain roadmap

This roadmap focuses on terrain-generation changes that would create a much more dramatic world silhouette: taller mountain walls, deeper valleys, sharper canyons, and stronger large-scale composition.

The current pipeline is already a good base for this work:

- [`TerrainSynthesis.js`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainSynthesis.js) owns the offline macro height field and hydrology raster.
- [`tools/bake-map.mjs`](/Users/sacha/Projects/fsim/tools/bake-map.mjs) already bakes the final quadtree from a single `sampleHeight(x, z)` entry point.
- The editor already exposes terrain tuning through the Terrain Lab UI.

## Highest-impact improvements

### 1. Add a tectonic range composer

Right now mountain mass is mostly a ridged-noise layer gated by a mask. That produces good breakup, but not enough deliberate mountain systems.

Upgrade the macro stage to synthesize a few named landforms before detail noise:

- range spines: long spline-like or polyline mountain chains with crossfall profiles
- uplift lobes: broad regional lift zones that raise entire mountain provinces
- collision seams: narrow high-energy belts where relief spikes and ridges cluster
- massif anchors: occasional large peak groups that create unmistakable skyline moments

Why this matters:

- It changes mountains from "noisy high ground" into readable ranges.
- It produces long dramatic walls, passes, and basin edges.
- It gives the world stronger silhouettes from cockpit altitude.

Suggested implementation:

- Add a `macroComposer` pass before `sampleMacroTerrain`.
- Generate a small set of deterministic range primitives from the seed.
- Blend ridged noise into those primitives instead of using ridged noise as the main mountain author.

Suggested new controls:

- `rangeCount`
- `rangeLength`
- `rangeWidth`
- `upliftStrength`
- `massifStrength`

### 2. Split valley generation into three distinct landforms

The current `valleyAmplitude` is a single carve term. It makes relief lower, but it does not strongly differentiate alpine valleys, canyons, and broad basins.

Replace the single carve with separate masks:

- glacial valleys: wide U-shaped cross-sections, ideal for dramatic mountain corridors
- fluvial canyons: narrow deep incision with steep sidewalls
- structural basins: broad low areas between ranges, useful for contrast and composition

Why this matters:

- Great terrain is mostly contrast. Huge peaks look taller when they drop into very different lowlands.
- This creates more varied flying routes: open basins, boxed canyons, and severe mountain cuts.

Suggested implementation:

- Build `glacialMask`, `canyonMask`, and `basinMask` rasters in the offline synthesis pass.
- Apply different carve curves:
  - glacial: wide smooth trough
  - canyon: sharp V-shaped incision
  - basin: broad depression with gentle floor

Suggested new controls:

- `glacialValleyStrength`
- `canyonDepth`
- `canyonWidth`
- `basinDepth`
- `basinBreadth`

### 3. Add drainage-aware gorge and cliff formation

Hydrology currently improves terrain shape, but rivers mostly carve soft depressions. To get cinematic landforms, high-flow channels should sometimes cut real gorges.

Extend the hydrology pass so major drainage lines can trigger:

- gorge deepening on steep high-relief channels
- canyon widening downstream
- terrace and floodplain transitions in lower valleys
- local cliff masks along over-steepened banks

Why this matters:

- It turns rivers into landform authors, not just overlays.
- It creates the kind of dramatic canyon systems that read from far away.

Suggested implementation:

- Upgrade `buildHydrologyModel` with depression handling and better flow routing.
- Add a second erosion pass that uses:
  - slope
  - flow accumulation
  - local relief
- Emit reusable fields:
  - `erosionMask`
  - `gorgeMask`
  - `floodplainMask`
  - `cliffMask`

Suggested new controls:

- `gorgeStrength`
- `incisionBias`
- `floodplainWidth`
- `cliffThreshold`

### 4. Introduce hard escarpments and plateau shelves

Everything currently trends toward rolling transitions. A cinematic world benefits from some terrain that feels abrupt and architectural.

Add a structural-landform layer that creates:

- fault scarps
- mesa edges
- uplifted plateaus
- stepped benches and shelves

Why this matters:

- Sheer escarpments make the world feel less uniformly eroded.
- Plateaus next to deep river cuts create extremely strong composition.
- They also make approach paths and horizon lines much more memorable.

Suggested implementation:

- Add a low-frequency signed distance mask for escarpment lines.
- Quantize some uplift regions into shelf bands before erosion.
- Let hydrology breach through selected shelves to form slot canyons and dramatic exits.

Suggested new controls:

- `escarpmentStrength`
- `plateauHeight`
- `shelfCount`
- `shelfSharpness`

### 5. Add a peak-shaping pass for heroic summits

Ridged noise gives many peaks, but not many iconic peaks. A small number of summits should be much more intentional.

Add a summit pass that creates:

- horn-like peaks
- serrated ridge crests
- shoulder saddles
- amphitheater cirques near the highest elevations

Why this matters:

- A handful of memorable peaks do more for perceived terrain quality than many generic ones.
- Peak silhouettes are especially visible in low sun and hazy distance.

Suggested implementation:

- Detect high-elevation local maxima after macro uplift.
- Apply a local summit profile transform:
  - tighten crest
  - steepen upper slopes
  - broaden lower shoulders
- Feed the result into the cliff and snow masks later.

Suggested new controls:

- `summitFrequency`
- `summitSharpness`
- `ridgeSerration`
- `cirqueStrength`

### 6. Make the world composition-aware around the airport and routes

For a flight sim, the terrain should not be equally dramatic everywhere. The best results come from placing the strongest scenery where the player will actually read it.

Add composition masks that shape the terrain relative to authored points of interest:

- preserve a flyable basin around the airport
- place major ranges on the horizon line
- route at least one canyon or valley corridor into the playable region
- stage a few "hero viewpoints" for climb-out and approach

Why this matters:

- It improves the experience more than purely global realism work.
- It creates deliberate reveals instead of random noise luck.

Suggested implementation:

- Add seeded but constrained landform placement around the runway and POIs.
- Treat the airport region as a composition input, not just a flattening exclusion.
- Reserve sectors for:
  - a major distant wall
  - one side-range
  - one drainage corridor
  - one open basin

## Supporting improvements

### 7. Emit terrain classification masks for shading and props

Once the generator produces stronger structure, the renderer should reinforce it.

Useful outputs:

- `cliffMask`
- `talusMask`
- `alpineMask`
- `wetlandMask`
- `terraceMask`

Visual payoff:

- rock on cliffs
- scree on steep toes
- greener valley bottoms
- drier shelves and plateaus
- better tree placement and density breakup

This is lower priority than the shape changes, but it multiplies the payoff of every generator improvement.

### 8. Add inland river and lake geometry

The current metadata already identifies rivers and lakes, but the runtime water system still mostly assumes sea level.

Bringing inland water to runtime would amplify the terrain improvements:

- reflective canyon rivers
- alpine lakes in basins
- braided lowland channels
- visible valley floor structure from altitude

This is more rendering-facing than generator-facing, but the cinematic gain is large.

## Recommended rollout order

### Phase 1: Big silhouette win

Implement first:

- tectonic range composer
- split valley system
- airport-aware composition masks

Expected result:

- immediate improvement in mountain readability
- stronger horizons
- better contrast between mountains, basins, and corridors

### Phase 2: Dramatic incision

Implement next:

- drainage-aware gorge formation
- escarpments and plateaus
- summit shaping

Expected result:

- real canyon systems
- memorable ridgelines
- more extreme terrain drama

### Phase 3: Payoff and polish

Implement after shape quality is there:

- classification masks
- inland river and lake runtime support
- extra Terrain Lab controls and overlays

## Concrete code touchpoints

Primary generator work:

- [`TerrainSynthesis.js`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainSynthesis.js)

Bake integration:

- [`tools/bake-map.mjs`](/Users/sacha/Projects/fsim/tools/bake-map.mjs)

Editor controls:

- [`js/editor/ui/app.jsx`](/Users/sacha/Projects/fsim/js/editor/ui/app.jsx)

Runtime visual follow-through:

- [`js/modules/world/terrain.js`](/Users/sacha/Projects/fsim/js/modules/world/terrain.js)
- [`js/modules/world/terrain/TerrainMaterials.js`](/Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainMaterials.js)

## Best next step

If the goal is maximum visual gain for the next iteration, the best single package is:

1. Add a tectonic range composer.
2. Replace the single valley carve with basin plus canyon masks.
3. Make terrain placement composition-aware around the airport.

That combination should produce the biggest jump toward "dramatic mountains, deep valleys, canyons" without needing a full erosion simulator first.

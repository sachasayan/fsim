# Graphics Improvements Tracker

Goal: maximize on-screen visual fidelity while preserving strong performance.

Status legend: `[ ] todo`, `[-] in progress`, `[x] done`

## Priority Order

1. `[x]` Terrain material/shader upgrade (world-space layered detail, slope/height blending)
   - Files: `js/modules/world/terrain.js`
2. `[x]` Runway PBR + markings refinement (roughness breakup, subtle wear/patched asphalt)
   - Files: `js/modules/world/runway.js`
3. `[x]` Contact shadow / ambient occlusion pass (lightweight grounding)
   - Files: `js/modules/sim.js`, `js/modules/world/environment.js`
4. `[x]` Cloud edge softening + lighting phase shaping
   - Files: `js/modules/world/clouds.js`
5. `[x]` Anti-aliasing quality pass (motion shimmer reduction)
   - Files: `js/modules/sim.js`
6. `[x]` Color pipeline polish (grading/bloom tuning/aerial perspective)
   - Files: `js/modules/sim.js`, `js/modules/world/environment.js`
7. `[x]` Shadow quality stability improvements (better useful shadow texel usage)
   - Files: `js/modules/world/environment.js`, `js/modules/sim.js`

## Change Log

- Completed item 1: terrain shader/material detail pass.
- Completed item 2: runway PBR refinement using procedural roughness and bump maps.
- Completed item 3: contact shadow/AO using SSAO post-processing pass.
- Completed item 4: cloud edge softening and phase-light shaping for near + far cloud layers.
- Completed item 5: added SMAA anti-aliasing pass for reduced shimmer.
- Completed item 6: added subtle color-grading pass for contrast/saturation balance.
- Completed item 7: added dynamic directional shadow frustum fitting around aircraft.
- Photoreal follow-up pass:
  - Rebalanced runway albedo/PBR to prevent over-dark asphalt at low sun.
  - Reduced water glare clipping and improved specular behavior.
  - Added atmospheric distance blending for terrain/water/trees/buildings.
  - Added far-cloud radial domain fade + warp to remove visible layer seams.
- Performance re-architecture pass:
  - Split terrain generation into two queues:
    - Base chunk pass (`terrain + water`)
    - Deferred prop pass (`trees + buildings + boats`)
  - Result: significantly reduced terrain-streaming frame spikes while preserving final visual output.

## Performance Impact Assessment

Runtime priority: in-flight FPS first, streaming stutter second.

### High Impact (Most likely FPS cost)

1. `Contact shadow / ambient occlusion pass (SSAO)`
   - Why: full-screen post pass with depth/normal sampling; expensive even at half res.
   - Recommendation: `KEEP`, but lower fixed quality baseline:
     - Kernel radius `6 -> 4`
     - Reduce AO intensity in shader/pass settings
     - Keep half-resolution internal target
   - Remove only if still CPU/GPU bound after post stack tuning.

2. `Anti-aliasing quality pass (SMAA)` + existing bloom + grading stack
   - Why: multiple full-screen passes every frame.
   - Recommendation: `KEEP`, but consolidate post pipeline:
     - Merge color grading into bloom composite or a shared pass if feasible
     - Ensure only one final color pass runs after bloom
   - Removal: avoid removing SMAA first; it strongly affects perceived quality in motion.

3. `Terrain material/shader upgrade` + `atmospheric distance blending` on many materials
   - Why: added texture sampling and per-fragment math across large terrain coverage, trees, buildings, water.
   - Recommendation: `OPTIMIZE`, not remove:
     - Keep atmospheric blend only on terrain + water by default
     - Disable atmosphere shader injection for far-prop materials (trees/buildings) first if needed
   - Removal: remove prop-level atmosphere before removing terrain detail.

### Medium Impact

4. `Cloud edge softening + phase shaping`
   - Why: additional math/noise in far cloud fragment shader; transparent overdraw remains dominant.
   - Recommendation: `KEEP`; if needed:
     - Reduce far layer shader complexity (fewer FBM calls)
     - Keep domain fade, trim warp complexity first.

5. `Runway PBR refinement`
   - Why: localized asset, modest map sampling overhead.
   - Recommendation: `KEEP` (high visual value, low scene-wide cost).

### Low/Positive Impact

6. `Shadow quality stability improvements`
   - Why: cached frustum updates reduce overhead vs prior per-frame projection updates.
   - Recommendation: `KEEP`.

7. `Terrain two-queue generation re-architecture`
   - Why: reduces chunk-streaming frame spikes.
   - Recommendation: `KEEP` and extend to workerized base generation.

## Proposed Next Perf Plan (No Adaptive Quality)

1. Reduce fixed post baseline cost:
   - Tune SSAO radius/intensity; keep half-res.
   - Fuse or simplify post passes (grade+bloom ordering and pass count).
2. Trim shader breadth before shader depth:
   - Keep terrain atmospheric blend.
   - Remove per-material atmospheric shader injection from trees/buildings first.
3. Workerize terrain base generation:
   - Move height/color/water array generation off main thread.
   - Keep mesh creation/instancing on main thread.

## Baseline Perf Decisions (Applied)

- Removed SSAO completely from pipeline (import/setup/pass/resize).
- Removed dedicated color-grading post pass to cut one full-screen pass.
- Kept SMAA and bloom.
- Limited atmospheric material injection to `terrain + water` only (removed from tree/building materials).

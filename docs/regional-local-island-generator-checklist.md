# Regional Local Island Generator Checklist

## Core Generator Model
- [x] Make each terrain region use its own local coordinate space defined by the full rectangular region bounds.
- [x] Remove dependence on absolute world position for regional terrain composition.
- [x] Ensure region output is derived only from region seed/settings, not world placement.
- [x] Keep unassigned space as ocean.
- [x] Preserve hard seams between neighboring regions.

## Local Coordinate Mapping
- [x] Add a region-local transform from world `(x, z)` to normalized regional coordinates.
- [x] Define a stable local origin and scale based on the region rectangle.
- [x] Make the same config produce the same terrain regardless of where the rectangle sits in the world.
- [x] Ensure non-square regions still map cleanly without distortion bugs.

## Island Composition
- [x] Add a local island-shaped landmass mask for each region.
- [x] Bias the default composition toward one main island.
- [x] Allow the main island to drift off-center within the region.
- [ ] Leave room in the model for future multi-island / archipelago tuning.
- [x] Keep edge-touching regions self-contained islands, not clipped continents.

## Boundary Falloff
- [x] Add a shoreline falloff near region edges.
- [x] Make the falloff gradual enough that landforms can approach the boundary before dropping into ocean.
- [x] Apply the coastal gradient as part of the local height composition, not as a post-hoc hard clamp.
- [x] Verify the boundary still resolves to ocean at the region perimeter.

## Terrain Synthesis Refactor
- [x] Split world-scale synthesis assumptions out of `createTerrainSynthesizer`.
- [x] Introduce a regional synthesis path that takes region bounds/local-space info.
- [x] Refactor range placement so mountain systems are generated inside the local region, not the whole world.
- [x] Refactor hydrology raster generation so it runs over regional space, not global world space.
- [x] Ensure rivers/lakes are local to the region and terminate coherently within the island model.

## Regional Sampler Integration
- [x] Update `createRegionalTerrainSampler` to instantiate local-region synthesizers.
- [x] Pass region bounds into synthesizer construction.
- [x] Sample terrain via local coordinates after region lookup.
- [x] Keep ocean fallback outside any region.
- [x] Avoid sharing generator state that can leak between regions.

## Seed Isolation
- [x] Normalize regional noise seeding so each region gets an isolated seeded noise instance.
- [x] Align regional seeding behavior with the single-world seeded path.
- [x] Verify identical settings on two differently placed regions generate identical local terrain.

## Editor Preview
- [x] Make Terrain Lab preview use the same regional-local generator path as runtime.
- [x] Preview selected regions as self-contained islands within their own bounds.
- [x] Verify preview matches baked/runtime output for the same region config.
- [x] Confirm overlay previews still work with local hydrology/masks.

## Runtime / Bake Consistency
- [x] Ensure editor tile rendering uses the new local regional generator.
- [x] Ensure baked metadata/runtime sampling agree on the regional model.
- [ ] Confirm terrain edits still layer correctly on top of the new base terrain.

## Validation
- [x] Add tests proving region output is invariant to world placement.
- [x] Add tests proving outside-region samples remain ocean.
- [x] Add tests proving edge-touching regions remain self-contained islands.
- [x] Add tests proving regional seeds are isolated.
- [x] Add tests proving preview/runtime/regional sampler agree.
- [x] Add tests for rectangular regions with very different aspect ratios.

## Nice-To-Have Follow-Up
- [ ] Add explicit composition controls for `single island` vs `archipelago`.
- [ ] Add controls for island drift, coastal shelf width, and shoreline falloff.
- [ ] Add visual debug overlays for region-local masks and coast falloff.

## Locked Assumptions
- [x] Full rectangular region bounds define local space.
- [x] Default bias is one main island.
- [x] Regions are self-contained even at world edges.
- [x] Landforms may run close to the boundary before tapering off.
- [x] No border blending between adjacent regions for now.
- [x] Main landmass may be off-center.
- [x] Output depends only on seed/settings, not world placement.

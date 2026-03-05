# City Generation — Code Review

## Files Changed (this session)

| File | Type | Summary |
|---|---|---|
| [tools/build-world.mjs](file:///Users/sacha/Projects/fsim/tools/build-world.mjs) | NEW | Offline city compiler — Voronoi layout, building placement, road mask rasterization |
| [tools/map.json](file:///Users/sacha/Projects/fsim/tools/map.json) | NEW | Hand-authored world data (3 cities, districts) |
| [js/modules/world/terrain/CityChunkLoader.js](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/CityChunkLoader.js) | NEW | Runtime binary chunk parser + DataTexture creation |
| [js/modules/world/terrain/TerrainGeneration.js](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainGeneration.js) | MODIFIED | City chunk injection, terrain material cloning, building spawner |
| [js/modules/world/terrain/TerrainMaterials.js](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainMaterials.js) | MODIFIED | Fragment shader road mask injection |
| [js/modules/world/terrain/TerrainWorker.js](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainWorker.js) | MODIFIED | Suppresses noise buildings inside city radii |
| [js/modules/ui/hud.js](file:///Users/sacha/Projects/fsim/js/modules/ui/hud.js) | MODIFIED | Minimap city arrow + distance label |
| [js/modules/world/terrain.js](file:///Users/sacha/Projects/fsim/js/modules/world/terrain.js) | MODIFIED | Added `terrainMaterial`, `terrainFarMaterial`, `terrainDetailUniforms` to chunk props context |
| [server.js](file:///Users/sacha/Projects/fsim/server.js) | MODIFIED | Added [.bin](file:///Users/sacha/Projects/fsim/world/chunks/city_a/city.bin) and [.mjs](file:///Users/sacha/Projects/fsim/test-bin.mjs) MIME types |
| [package.json](file:///Users/sacha/Projects/fsim/package.json) | MODIFIED | Added `build:world` script, `pngjs` and `playwright` devDeps |

---

## 🔴 Architectural Concerns

### 1. Material Cloning Per City Chunk
**File:** `TerrainGeneration.js:372-376`

Every terrain chunk that overlaps a city calls `terrainMaterial.clone()` and re-calls [setupTerrainMaterial(...)](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainMaterials.js#417-554) which re-runs [onBeforeCompile](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainMaterials.js#275-413) injection logic. 

- **Risk:** Three.js will compile a new WebGL shader program for each unique [customProgramCacheKey](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainMaterials.js#98-101). Currently there are only 4 variants ([near](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainWorker.js#82-89), `far`, `near-city`, `far-city`), so programs are pooled via [customProgramCacheKey](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainMaterials.js#98-101) — this is correct. **However**, if a second city with a different mask is ever loaded simultaneously, both will share the same `near-city` cache key but have different uniform texture values. Two cities loaded at the same time will break the shader: the last loaded city's texture will win for all chunks regardless of which city they belong to.

- **Fix required before multi-city support:** Make the cache key include the city ID. [setupTerrainMaterial](file:///Users/sacha/Projects/fsim/js/modules/world/terrain/TerrainMaterials.js#417-554) must become a factory that creates materials per-city rather than mutating shared uniforms. Alternatively, store per-city uniform objects and swap them in `onBeforeRender`.

---

### 2. No Chunk Pool Reset When Returning From City
**File:** `TerrainGeneration.js:372` (`chunkGroup.userData.hasCityMaterial`)

The `hasCityMaterial` flag is set to `true` when a chunk is first populated as a city chunk. When the chunk is recycled back to the pool ([disposeChunkGroup](file:///Users/sacha/Projects/fsim/js/modules/world/terrain.js#177-194) in `terrain.js:177-193`), the flag is **not** reset and the cloned city material is **not** disposed. This means:

- If a city-chunk is evicted, pooled, then reused for a non-city chunk, the terrain mesh still has the city material (with HAS_CITY_MASK defined and road texture bound) even though there's no longer a road mask relevant to it.
- The cloned material leaks GPU resources.

**Fix:** In [disposeChunkGroup](file:///Users/sacha/Projects/fsim/js/modules/world/terrain.js#177-194), iterate children, and if `child.userData.hasCityMaterial`, dispose the cloned material and restore the shared `terrainMaterial`. Clear the flag.

---

### 3. Voronoi Ownership Test is O(n²) Per Building
**File:** `build-world.mjs:placeBuildingsInCity`

For each building candidate, the code iterates all 60 Voronoi seeds to determine which cell owns the point. With ~(steps × steps) candidates per cell × 60 cells this is O(60³) in the worst case. With `lotStep=50m` and `cellR=240m`, each cell scans a ~10×10 grid = 100 candidates, each doing 60 lookups → **360,000 distance checks per city**. This is fast enough today but will scale poorly if seed count or city radius grows.

**Fix (future):** Build a naive grid index over the seeds. Since this is offline, correctness matters more than speed right now.

---

### 4. `pngjs` and `playwright` Are in `devDependencies` But `pngjs` Is Required at Build Time
**File:** [package.json](file:///Users/sacha/Projects/fsim/package.json)

`pngjs` is used in [tools/build-world.mjs](file:///Users/sacha/Projects/fsim/tools/build-world.mjs) to write debug PNG mask files. This is fine if `build:world` is only ever run in dev, but if a CI or deploy system ever runs it without installing devDependencies, the script will fail.

**Fix:** Either move `pngjs` to `dependencies`, or strip the PNG debug write from the production build path and only conditionally require it with a `--debug` flag.

---

### 5. Road Mask Rasterization Writes a PNG for Every City (debug artifact)
**File:** `build-world.mjs:500-509`

The `mask.png` files are written to `world/chunks/city_*/mask.png`. These are useful for debugging but are committed alongside the binary data, adding ~1MB per city to version control.

**Fix:** Add `world/chunks/*/mask.png` to [.gitignore](file:///Users/sacha/Projects/fsim/.gitignore), or gate it behind a `DEBUG=1 npm run build:world` env var.

---

## 🟡 Performance Notes

### Road Mask Texture Memory
Each city loads a `1024×1024` single-channel (`THREE.RedFormat`) texture into GPU VRAM. At 8-bit depth that is **1 MB per city** on GPU. With 3 current cities all in view simultaneously that's 3 MB — trivial. Worth monitoring if city count grows past ~10.

### Fragment Shader Branch
The `#ifdef HAS_CITY_MASK` block adds a conditional texture2D sample and ~15 ALU ops to the terrain fragment shader for every terrain pixel inside the city bounds. This is a small, fixed cost and does not affect chunks outside the city AABB. No concern at current scale.

### Building Count
The Voronoi-cell building placement currently generates ~3.5k buildings per city. That's within the target range for [InstancedMesh](file:///Users/sacha/Projects/fsim/js/modules/world/terrain.js#151-176) batching (current system). Watch instanced mesh `count` per class — if any class exceeds `32k` instances across all chunks, the `Uint16` index buffer in old-style geometry will overflow (doesn't apply to [InstancedMesh](file:///Users/sacha/Projects/fsim/js/modules/world/terrain.js#151-176), but worth noting).

---

## 🟢 What's Working Well

- **Shader projection is zero-cost per vertex**: roads are composited in the fragment shader with no added draw calls or geometry.
- **Binary format is versioned**: The `VERSION` bump to `2` and `maskOffset` header field mean old V1 readers can gracefully skip the new mask.
- **Building orientation snapping**: buildings snap to the nearest road direction — gives a natural street-facing feel with no hand-tuning.
- **City overlap suppression in TerrainWorker** is clean and fast — precomputes squared radii and reuses the check inline.
- **Zero impact on non-city chunks**: the `HAS_CITY_MASK` shader define is never added to chunks outside city boundaries, so non-city framerate is completely unaffected.

---

## Outstanding Debt / Next Steps

1. **Multi-city material isolation** (see concern #1) — required before loading two cities simultaneously.
2. **Material + flag cleanup on chunk eviction** (concern #2) — prevents VRAM leak with long sessions.
3. **Gitignore the debug mask PNGs** (concern #5) — quick win.
4. **Automated visual regression test loop** — user mentioned this as next priority.
5. **Map editor UI** — from the original quorum: the long-term intent is a map-painting canvas to hand-place city boundaries rather than editing [map.json](file:///Users/sacha/Projects/fsim/tools/map.json) as JSON.

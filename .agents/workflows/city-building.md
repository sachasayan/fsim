---
description: How to generate and refine procedural cities
---
# City Building Workflow

This workflow describes the process for defining, building, and verifying planetary cities in `fsim`.

## 1. Blueprint Definition (`tools/map.json`)

Cities are defined as a set of districts and parameters in the global map configuration.

1.  **Locate the city**: Add or find a city entry in the `cities` array.
2.  **Set Coordinates**: Define the `center` as `[x, z]` world coordinates.
3.  **Define Districts**:
    *   **Circular**: Use `type: "radius"` with a `radius` value.
    *   **Polygonal**: Use `points: [[x1,z1], [x2,z2], ...]` for custom urban shapes.
    *   **Weights**: Adjust `weight` (0.0 - 1.0) to control building density.
4.  **Layout Tuning**:
    *   `gridAngle`: Degrees to rotate the voronoi/road grid.
    *   `cellScale`: Controls the average size of blocks/lots.

## 2. World Rebuild

After modifying `map.json`, you must recompile the binary city chunks.

// turbo
```bash
npm run build:world
```

This updates the `.bin` files and `index.json` in `public/world/chunks/`.

## 3. Visual Verification

Use the screenshot tool to inspect the generated layout from specific angles.

1.  **Add Vantage Point**: If necessary, add a new camera position to `screenshots/vantage_points.json`. Use `hideplane: 1` for clear views.
2.  **Capture Screenshot**:
    ```bash
    npm run screenshot -- --vantage=city_overview --fog=0 --clouds=0
    ```
3.  **Inspect**: Check `screenshots/[vantage]_[timestamp].png` for:
    *   Building clipping on roads.
    *   Unintended empty spaces.
    *   District transitions.

## 4. Real-time Refinement

If the layout is correct but the *visuals* (textures, density, lighting) need work:

*   **Shaders**: Edit `js/modules/world/terrain/TerrainMaterials.js`. This affects the ground, roads, and traffic.
*   **Props/Buildings**: Edit `js/modules/world/terrain/TerrainGeneration.js` (`generateChunkProps`). This affects building types and density logic.

Note: Shader and Prop changes do *not* require a `build:world` run, only a browser refresh.

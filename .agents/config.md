# fsim: Flight Simulator Project Context

## Project Overview
`fsim` is an airline flight simulator built with Three.js and Rapier physics. It features procedural terrain, city generation, and sophisticated flight dynamics.

## Critical Capabilities for Agents

### E2E Visual Feedback
You MUST use visual feedback when modifying anything related to rendering, shaders, or procedural generation.

- **Tool**: `npm run screenshot`
- **Workflow**: See `.agents/workflows/e2e-testing.md` for detailed usage instructions.
- **Vantage Points**: Use preset vantage points defined in `screenshots/vantage_points.json` to verify changes from consistent perspectives.
  - `city_overview`: Best for inspecting procedural urbanization and road networks.
  - `runway_view`: Best for airport lighting and ground detail.

### Development Guidelines
- **Shaders**: Many effects (atmosphere, road masking, building pop-in) are implemented via `onBeforeCompile` in materials. Check `js/modules/terrain/TerrainMaterials.js`.
- **Performance**: Headless screenshot runs use a `fastload=1` parameter to accelerate initialization. Do not disable this in automated scripts.
- **Physics**: The simulation runs at a fixed 75Hz. Visual updates are decoupled from physics steps.

## Directory Structure
- `js/modules`: Primary application logic.
- `scripts`: Development and automation tools (including screenshotting).
- `world`: Procedural data and city definitions.
- `screenshots`: Output directory for testing and vantage point configuration.

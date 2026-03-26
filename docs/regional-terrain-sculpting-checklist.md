# Regional Terrain Sculpting Checklist

## Core Model
- [x] Define the map as a fixed `64x64` tile grid.
- [x] Define a "region" as a rectangular tile selection on that grid.
- [x] Support region sizes from `1x1` up to any rectangular selection within the map bounds.
- [x] Treat any tile not assigned to a region as default ocean.
- [x] Enforce that each tile belongs to either:
  - [x] no region
  - [x] exactly one region
- [x] Enforce that regions are solid rectangles with no holes.
- [x] Enforce hard region boundaries during sculpting.

## Data Persistence
- [x] Persist regions as first-class editor data, not just final terrain output.
- [x] Store each region's rectangle coordinates in saved world/map data.
- [x] Store each region's sculpt/generation inputs so it can be regenerated later.
- [x] Do not store overlap between regions.
- [x] Continue persisting baked terrain/map output separately from region inputs.

## Region Rules
- [x] Block creation of a new region if any selected tile is already assigned to another region.
- [x] Allow selecting any unassigned rectangular area and creating a region from it.
- [x] Allow reopening an existing region and resculpting it later.
- [x] Do not support moving regions yet.
- [x] Do not support resizing regions yet.
- [x] Give each region its own generation settings.
- [x] Give each region its own seed/settings state independent from other regions.

## Editor Interaction
- [x] Support single-tile selection.
- [x] Support click-drag rectangular multi-tile selection.
- [x] Show which tiles are already assigned versus unassigned ocean.
- [x] Prevent invalid drag selections that overlap existing regions.
- [x] Allow selecting an existing region for editing.
- [x] Allow deleting an existing region.

## Grid-Native Region Selection
- [x] Make region creation feel grid-native, with explicit 64x64 tile cell selection rather than free-form canvas rectangle drawing.
- [x] Show a distinct hovered tile under the cursor while the Region tool is active.
- [x] Show drag selection as discrete selected cells rather than only as a world-space marquee.
- [x] Make the selected rectangle boundaries visually align with tile edges at all zoom levels.
- [x] Differentiate unassigned tiles, assigned tiles, hovered tiles, valid selections, and invalid selections clearly.
- [x] Prevent region creation gestures from feeling like generic canvas rectangle drawing.
- [x] Ensure click-drag selection snaps consistently to tile cells from drag start through drag end.
- [x] Make overlap conflicts obvious at the tile level, not just via a generic error state.
- [ ] Confirm the selection UX still works clearly when zoomed far out.
- [ ] Confirm the selection UX still works clearly when zoomed far in.

## Bug Fixes
- [x] Fix Region tool input routing so `terrain-region` does not fall through to terrain brush stroke creation.
- [x] Fix Region tool hover/preview so it does not show the terrain brush circle.
- [ ] Verify directly in the editor that clicking starts region selection and dragging produces rectangular tile selection instead of freeform sculpting.

## Current Investigation Plan
- [x] Remove the legacy global-terrain fallback so a world with zero regions still bakes as ocean floor everywhere.
- [x] Make Terrain Lab preview generation region-aware, so preview/regenerate reflects the selected region rather than a whole-map global config.
- [x] Make Terrain Lab apply/reset/seed edits operate only on the selected region and never imply whole-map editing while a region is selected.
- [x] Hide the Terrain Brush panel unless a terrain brush tool is active.
- [x] Hide the Terrain Lab panel unless a terrain region is selected.
- [x] Reframe the no-selection / non-region-selected state so the editor never suggests terrain settings are editable when nothing terrain-scoped is selected.

## Delete Behavior
- [x] On delete, remove the region record entirely.
- [x] Reset all tiles in that region back to default ocean.
- [x] Do not preserve deleted-region history beyond normal editor behavior.

## Generation / Baking Flow
- [x] Regenerate terrain for a region from its saved inputs when edited.
- [x] Apply generated results only within that region's rectangle.
- [x] Preserve hard edges at the rectangle boundary.
- [x] Ensure unassigned tiles remain ocean during bake/regeneration.

## Validation
- [x] Validate region bounds stay within the `64x64` grid.
- [x] Validate no region overlap on create/load.
- [x] Validate persisted region data can fully recreate sculptable editor state.
- [x] Validate deleting a region restores baked output to ocean in that area.

## Later / Out of Scope For Now
- [ ] Region move
- [ ] Region resize
- [ ] Overlap/merge/replace workflows
- [ ] Soft blending across region edges

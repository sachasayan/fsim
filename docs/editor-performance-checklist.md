# Editor Performance Checklist

This checklist tracks the current editor performance and architecture work, with emphasis on the canvas controller/render loop and hot interaction paths.

Status key:
- `[x]` Done
- `[-]` Partially done
- `[ ]` Not done

## P1 Items

- [x] Reduce pointer-move hover cost so hover and brush movement do not perform full-scene hit-testing on every event.
- [x] Remove hot-path ephemeral pointer/render state from the global editor store where possible.
- [x] Reduce whole-app rerenders caused by hot store updates such as hover, camera, and terrain-region hover changes.
- [x] Replace expensive terrain-region preview cache invalidation based on cloning and `JSON.stringify` with explicit versioned cache keys.

## Quick Low-Risk Wins

- [x] Keep hover-only state out of the global store and paint it directly from controller-local state where practical.
- [x] Add selector equality or equivalent subscription narrowing so the top-level editor UI does not subscribe to the entire store by default.
- [x] Cache `canvas.getBoundingClientRect()` for pointer interactions and invalidate it on resize/layout changes instead of recomputing it on every event.
- [x] Add cheap bounds-first hit-test short-circuiting before polygon/segment containment work.
- [x] Replace `JSON.stringify(previewRegions)` cache keys with explicit versions derived from terrain-region/document state and terrain-lab config state.
- [x] Avoid per-tile terrain-region painting for large regions unless selected or actively edited, or gate it behind a higher zoom threshold.
- [x] Reduce repeated screen-space/path rebuilding for shapes that are stroked or filled multiple times per frame.

## Notes

- [ ] Re-profile after the P1 items and quick wins are complete before deciding whether a store-library migration is still warranted.

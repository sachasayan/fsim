# Terrain Deprecation Roadmap

## Principles

- Leaf-native terrain is the canonical runtime path.
- Runtime terrain should use fixed reusable regular patch footprints, not bespoke CPU mesh reconstruction.
- Bootstrap is a bounded special mode, not a permanent second terrain architecture.
- Refinement must be selective and budgeted, never eager or global.
- Baked per-leaf payloads should grow over time so runtime derives less.

## Keep

- `chunkBase` is no longer the normal post-bootstrap terrain path.
- Non-blocking chunks do not build `chunkBase` terrain.
- Chunk groups can host props without a terrain mesh.
- `chunkBase` remains as a bootstrap fallback only.
- `chunkBase` role diagnostics stay in perf reports.

## Revert

- Do not use eager provisional-leaf refinement.
- Do not require bootstrap-blocking-only `chunkBase` yet.
- Do not chase zero `chunkBase` usage if it causes leaf queue churn or stable render regressions.

## Next

1. Keep the current "last good checkpoint" as the default branch state.
2. Measure `chunkBase` bootstrap usage across a small stable scenario set.
3. Design a cheaper bootstrap leaf mode that uses the same fixed regular leaf patch footprint as normal runtime terrain.
4. Only refine leaves selectively:
   - blocking leaves
   - very near leaves
   - or leaves that remain selected for a minimum dwell time
5. Give refinement its own strict budget so initial readiness work cannot be starved by visual upgrades.
6. Expand baked leaf payloads before adding more runtime derivation:
   - normals or normal-friendly derivative data
   - water/support masks
   - any stable terrain classification data that is currently recomputed every build
7. Continue using stable repeated-run A/B captures before keeping changes.

## Avoid

- Broad architectural deletions without direct `chunkBase` role metrics.
- Replacement strategies that increase pending leaf backlog.
- Interpreting unstable streaming captures as final truth without a stable cross-check.
- Reintroducing a second long-lived terrain ownership model after bootstrap.
- Treating provisional leaf surfaces as immediate refinement candidates by default.

# Editor UI Migration Checklist

This checklist tracks the remaining work for the editor migration to Vite + Tailwind v4 + shadcn-style primitives.

Status key:
- `[x]` Done
- `[-]` Partially done
- `[ ]` Not done

## Current Status Summary

- `[x]` Vite-based editor build exists and produces a bundled editor app
- `[x]` Tailwind v4 is installed and driving the editor stylesheet
- `[x]` The editor is available at `/editor`
- `[x]` Node backend APIs for `/tools`, `/config`, `/save`, and `/rebuild-world` still work with the migrated editor
- `[x]` Existing editor E2E flows still pass
- `[x]` Editor E2E now fails on browser `console.error` and `pageerror`
- `[x]` Broad UI migration is underway across the main editor shell
- `[-]` shadcn/Radix primitives are present and broadly adopted, but final standardization is not complete
- `[x]` Feature-level component decomposition is in place for the main editor shell
- `[-]` Migration-specific regression coverage is substantially improved but not fully complete
- `[-]` Shared semantic layout/presentation helpers now cover more of the top bar, dock intro, icon surfaces, and terrain lab sections, but some ad hoc styling still remains

## Current Deferral

- `[-]` Accessibility-specific keyboard/ARIA review is intentionally deferred for now by request; continue with styling/system cleanup and manual polish first

## Tooling And Runtime

- `[x]` Add Vite config for the editor app only
- `[x]` Add editor app entrypoint under `src/editor-app/`
- `[x]` Build editor output into `editor-dist`
- `[x]` Explicitly register Tailwind source paths for editor JSX outside `src/editor-app` so shared control styles are included in the final CSS
- `[x]` Keep Node dev server as the backend for save/rebuild/static data routes
- `[x]` Keep the sim runtime on the existing non-Vite stack
- `[x]` Add a combined editor dev command that starts both backend and Vite UI
- `[x]` Keep `/editor.html` working as a compatibility alias
- `[ ]` Decide whether `editor-dist` should be treated as purely generated output or become part of a release artifact flow

## Styling Migration

- `[x]` Move editor styles out of the inline `<style>` block in `editor.html`
- `[x]` Create a dedicated Tailwind-driven editor stylesheet
- `[x]` Preserve the current dark blue palette in CSS variables/theme tokens
- `[-]` Replace bespoke layout and utility styling with a smaller, more intentional semantic layer
- `[-]` Audit remaining editor-specific styling for places still depending on old naming/structure assumptions
- `[-]` Tighten the visual language so controls read as a coherent system rather than a mix of legacy and migrated styles

## shadcn / Radix Adoption

- `[x]` Add shared UI primitives for:
  - button
  - toggle
  - select
  - input
  - slider
  - badge
  - card
  - separator
- `[x]` Use those shared primitives across the top command area
- `[x]` Use those shared primitives across the left tool rail
- `[x]` Convert the tool palette to a compact icon-first vertical strip with tooltip affordances
- `[x]` Use those shared primitives across layer visibility controls
- `[x]` Move layer visibility controls into a top-bar dropdown instead of a persistent left-dock panel
- `[x]` Move shortcut help into the top bar and present it in a modal instead of a left-dock panel
- `[x]` Use those shared primitives across inspector actions and basic form controls
- `[x]` Use those shared primitives across terrain lab actions and controls
- `[x]` Add tooltip primitives where appropriate for command and tool affordances
- `[-]` Standardize variant usage so buttons/toggles do not rely on ad hoc per-call styling
- `[-]` Review which remaining controls should become explicit reusable UI components instead of inline composition

## UI Refactor And File Structure

- `[x]` Convert the editor UI layer from `app.js` to JSX under Vite
- `[x]` Extract shared low-level UI primitives from the monolith
- `[x]` Split `js/editor/ui/app.jsx` into feature modules
- `[x]` Create dedicated modules/components for:
  - app bar
  - command strip
  - tool palette
  - layers panel
  - inspector panel
  - terrain brush panel
  - terrain lab panel
  - help panel
  - footer/status panel
  - toast
- `[-]` Move large blocks of derived display logic out of component bodies where it improves readability
- `[-]` Reduce repeated control configuration patterns by introducing reusable field helpers/config-driven sections where appropriate
- `[x]` Remove or archive the old `js/editor/ui/app.js` once the JSX migration is fully complete and no longer needed

## Behavior And Compatibility

- `[x]` Preserve save/rebuild API behavior
- `[x]` Preserve store command semantics
- `[x]` Preserve selection, undo/redo, and keyboard shortcut behavior
- `[x]` Preserve existing `data-testid` hooks needed by current Playwright coverage
- `[x]` Preserve editor route behavior while moving the canonical route to `/editor`
- `[-]` Do a targeted keyboard/ARIA audit for the migrated Radix-backed controls
- `[-]` Validate focus order and visible focus states across all interactive controls
- `[ ]` Validate that no remaining hidden browser errors occur during longer interactive editor sessions beyond the current E2E flows

## Testing

- `[x]` Keep existing editor E2E coverage green
- `[x]` Add failure-on-console-error/pageerror behavior to the editor E2E suite
- `[x]` Consider adding a reusable Playwright helper that can be shared by future editor tests to assert zero browser errors by default
- `[x]` Add focused regression tests for slider + numeric field synchronization
- `[x]` Add focused regression tests for select value dispatch and persistence
- `[x]` Add focused regression tests for keyboard activation and focus handling on primary controls
- `[x]` Add focused regression tests for toast/status feedback behavior
- `[ ]` Add visual regression coverage for the migrated editor shell so broken styling cannot pass behavior-only E2E

## Manual QA

- `[ ]` Compare the migrated editor against the intended design direction and decide whether it is visually “far enough” from the legacy handcrafted shell
- `[ ]` Review desktop spacing, density, and hierarchy across the full editor
- `[ ]` Review narrow-width/mobile behavior after the migration
- `[ ]` Review tool, layer, and inspector ergonomics for consistency
- `[ ]` Review terrain lab usability with the migrated controls

## Suggested Next Steps

1. Continue reducing the remaining ad hoc control/layout patterns into shared editor helpers and semantic classes.
2. Tighten the remaining styling/system consistency items in the checklist with a visual polish pass across dock panels, controls, and spacing.
3. Validate that no hidden browser/runtime errors appear during longer interactive editor sessions beyond the current E2E flows.
4. Run manual UI QA on desktop and narrow-width layouts, then decide whether the accessibility review should happen before or after final visual polish.

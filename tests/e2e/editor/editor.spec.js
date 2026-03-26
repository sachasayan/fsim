import { test, expect } from 'playwright/test';
import { clickCanvas, getEditorState, gotoEditor, hoverCanvas } from './helpers.js';

test.describe('editor e2e', () => {
    test.describe.configure({ mode: 'serial' });

    test('loads the editor and exposes initial clean state', async ({ page }) => {
        await gotoEditor(page);

        await expect(page.getByTestId('dirty-state-chip')).toHaveText('Up to date');
        await expect(page.getByTestId('layers-panel')).toBeVisible();
        await expect(page.getByTestId('inspector-empty')).toBeVisible();

        const state = await getEditorState(page);
        expect(state.dirty).toBe(false);
        expect(state.currentTool).toBe('select');
        expect(state.serialized.mapPayload.cities).toBeUndefined();
        expect(state.serialized.mapPayload.districts).toHaveLength(1);
    });

    test('supports toolbar clicks, shortcuts, help toggle, snap toggle, and reset view', async ({ page }) => {
        await gotoEditor(page);

        await page.getByTestId('tool-add-district').click({ force: true });
        await expect(page.getByTestId('tool-add-district')).toHaveClass(/active/);

        await page.keyboard.press('w');
        await expect(page.getByTestId('tool-add-road')).toHaveClass(/active/);

        await page.keyboard.press('?');
        await expect(page.getByText(/tools: v select, d district/i)).toBeVisible();

        await expect(page.getByTestId('grid-snap-chip')).toHaveText('Grid snap on');
        await page.keyboard.press('g');
        await expect(page.getByTestId('grid-snap-chip')).toHaveText('Grid snap off');

        await hoverCanvas(page, 480, 300);
        await page.mouse.wheel(0, -400);
        const beforeReset = await page.evaluate(() => window.__EDITOR_TEST__.store.getState().viewport);
        await page.keyboard.press('0');
        const afterReset = await page.evaluate(() => window.__EDITOR_TEST__.store.getState().viewport);
        expect(beforeReset.zoom).not.toBe(0.05);
        expect(afterReset.x).toBe(0);
        expect(afterReset.z).toBe(0);
        expect(afterReset.zoom).toBe(0.05);
    });

    test('creates a district, edits it, and keeps history coherent', async ({ page }) => {
        await gotoEditor(page);

        await page.getByTestId('tool-add-district').click({ force: true });
        await clickCanvas(page, 220, 180);

        await expect(page.getByTestId('dirty-state-chip')).toHaveText('Unsaved changes');
        await expect(page.getByTestId('inspector-panel')).toBeVisible();
        await expect(page.getByTestId('inspector-type-badge')).toHaveText('DISTRICT');

        const createdState = await getEditorState(page);
        expect(createdState.dirty).toBe(true);
        expect(createdState.selectedId).toBeTruthy();
        expect(createdState.serialized.mapPayload.districts).toHaveLength(2);

        const createdId = createdState.selectedId;
        await expect(page.getByTestId(`layer-item-${createdId}`)).toBeVisible();

        await page.getByTestId(`layer-select-${createdId}`).click({ force: true });
        await page.getByTestId('field-coord-x').fill('1500');
        await page.getByTestId('field-coord-x').blur();

        await expect(page.getByTestId('undo-count-chip')).toHaveText(/Undo 2/);

        let state = await getEditorState(page);
        expect(state.serialized.mapPayload.districts[1].center[0]).toBe(1500);

        await page.getByTestId('undo-button').click({ force: true });
        state = await getEditorState(page);
        expect(state.undoCount).toBe(1);
        expect(state.serialized.mapPayload.districts[1].center[0]).not.toBe(1500);

        await page.getByTestId('redo-button').click({ force: true });
        state = await getEditorState(page);
        expect(state.undoCount).toBe(2);
        expect(state.selectedId).toBe(createdId);
        expect(state.serialized.mapPayload.districts[1].center[0]).toBe(1500);
    });

    test('saves changes through isolated in-memory persistence', async ({ page }) => {
        await gotoEditor(page);

        const firstDistrictId = await page.evaluate(() => window.__EDITOR_TEST__.store.getState().document.index.groupIds.districts[0]);
        await page.getByTestId(`layer-select-${firstDistrictId}`).click({ force: true });
        await expect(page.getByTestId('inspector-panel')).toBeVisible();

        await page.getByTestId('field-coord-z').fill('1100');
        await page.getByTestId('field-coord-z').blur();

        await page.getByTestId('save-button').click({ force: true });

        await expect(page.getByTestId('save-button')).toHaveText('Saved');
        await expect(page.getByTestId('dirty-state-chip')).toHaveText('Up to date');
        await expect(page.getByTestId('toast')).toHaveText(/saved editor changes/i);

        const state = await getEditorState(page);
        expect(state.saveState).toBe('saved');
        expect(state.dirty).toBe(false);
        expect(state.serialized.mapPayload.districts[0].center[1]).toBe(1100);
    });

    test('clicking a selected terrain vertex edits it instead of starting a new terrain stroke', async ({ page }) => {
        await gotoEditor(page);

        const before = await page.evaluate(() => {
            const store = window.__EDITOR_TEST__.store;
            const result = store.runCommand({
                type: 'create-terrain-stroke',
                worldPos: { x: 0, z: 0 },
                tool: 'terrain-raise'
            }, {
                context: {
                    terrainStrokeDeps: {
                        terrainBrush: store.getState().tools.terrainBrush,
                        sampleTerrainHeight: () => 0,
                        tileManager: { invalidateWorldRect() {} }
                    }
                }
            });

            store.runCommand({
                type: 'append-terrain-point',
                entityId: result.selectionId,
                worldPos: { x: 400, z: 0 }
            });
            store.dispatch({ type: 'set-selection', selectedId: result.selectionId });
            store.dispatch({ type: 'set-tool', tool: 'terrain-raise' });

            return {
                terrainCount: store.getState().document.worldData.terrainEdits.length,
                selectedId: result.selectionId
            };
        });

        const canvas = page.getByTestId('map-canvas');
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        await canvas.click({
            position: {
                x: Math.round(box.width / 2),
                y: Math.round(box.height / 2)
            }
        });

        const after = await page.evaluate(() => {
            const store = window.__EDITOR_TEST__.store;
            return {
                currentTool: store.getState().tools.currentTool,
                selectedId: store.getState().selection.selectedId,
                terrainCount: store.getState().document.worldData.terrainEdits.length
            };
        });

        expect(after.currentTool).toBe('edit-poly');
        expect(after.selectedId).toBe(before.selectedId);
        expect(after.terrainCount).toBe(before.terrainCount);
    });
});

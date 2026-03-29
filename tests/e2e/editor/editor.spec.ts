import { test, expect, type Page } from 'playwright/test';
import { attachEditorErrorWatch, clickCanvas, getEditorState, gotoEditor, hoverCanvas } from './helpers';

type EditorErrorWatch = {
    allowConsoleError(pattern: RegExp): void;
    assertNoErrors(): void;
};

type EditorTestPage = Page & {
    __editorErrorWatch?: EditorErrorWatch;
};

test.describe('editor e2e', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({ page }, testInfo) => {
        const editorPage = page as EditorTestPage;
        testInfo.annotations.push({ type: 'editor-error-watch', description: 'Fails on browser console.error and pageerror' });
        editorPage.__editorErrorWatch = attachEditorErrorWatch(page);
    });

    test.afterEach(async ({ page }) => {
        (page as EditorTestPage).__editorErrorWatch?.assertNoErrors();
    });

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

        await page.getByTestId('shortcut-help-button').click();
        await expect(page.getByTestId('shortcut-help-modal')).toBeVisible();
        await expect(page.getByText(/tools: v select, a airport, d district, o object/i)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('shortcut-help-modal')).toBeHidden();

        await page.keyboard.press('?');
        await expect(page.getByTestId('shortcut-help-modal')).toBeVisible();
        await expect(page.getByText(/tools: v select, a airport, d district, o object/i)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('shortcut-help-modal')).toBeHidden();

        await expect(page.getByTestId('grid-snap-chip')).toHaveText('Grid snap on');
        await page.keyboard.press('g');
        await expect(page.getByTestId('grid-snap-chip')).toHaveText('Grid snap off');

        await page.getByTestId('layers-panel').click();
        await expect(page.getByTestId('layers-dropdown-menu')).toBeVisible();
        await expect(page.getByTestId('layer-toggle-districts')).toHaveClass(/active/);
        await page.getByTestId('layer-toggle-districts').click({ force: true });
        await expect(page.getByTestId('layer-toggle-districts')).not.toHaveClass(/active/);
        const layersAfterToggle = await getEditorState(page);
        expect(layersAfterToggle.groupVisibility.districts).toBe(false);

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
        await page.evaluate((entityId) => {
            window.__EDITOR_TEST__.store.dispatch({ type: 'set-selection', selectedId: entityId });
        }, firstDistrictId);
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

    test('places an airport, edits yaw, and saves serialized airport data', async ({ page }) => {
        await gotoEditor(page);

        await page.getByTestId('tool-add-airport').click({ force: true });
        await expect(page.getByTestId('airport-tool-panel')).toBeVisible();
        await clickCanvas(page, 320, 220);

        await expect(page.getByTestId('inspector-panel')).toBeVisible();
        await expect(page.getByTestId('inspector-type-badge')).toHaveText('AIRPORT');

        const inspector = page.getByTestId('inspector-panel');
        await inspector.getByTestId('field-yaw-deg-number').fill('135');
        await inspector.getByTestId('field-yaw-deg-number').blur();

        let state = await getEditorState(page);
        expect(state.serialized.mapPayload.airports).toHaveLength(1);
        expect(state.serialized.mapPayload.airports[0].template).toBe('default');
        expect(state.serialized.mapPayload.airports[0].yaw).toBe(135);

        await page.getByTestId('save-button').click({ force: true });

        await expect(page.getByTestId('save-button')).toHaveText('Saved');
        state = await getEditorState(page);
        expect(state.dirty).toBe(false);
        expect(state.serialized.mapPayload.airports).toHaveLength(1);
        expect(state.serialized.mapPayload.airports[0].yaw).toBe(135);
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

    test('migrated range controls keep slider and numeric inputs synchronized', async ({ page }) => {
        await gotoEditor(page);

        const roadId = await page.evaluate(() => window.__EDITOR_TEST__.store.getState().document.index.groupIds.roads[0]);
        await page.evaluate((entityId) => {
            window.__EDITOR_TEST__.store.dispatch({ type: 'set-selection', selectedId: entityId });
        }, roadId);

        const widthNumber = page.getByTestId('field-width-number');
        const widthSliderThumb = page.getByTestId('field-width-slider-thumb');

        await expect(widthNumber).toHaveValue('24');

        await widthNumber.fill('30');
        await widthNumber.blur();
        await expect(widthNumber).toHaveValue('30');

        let state = await getEditorState(page);
        expect(state.serialized.mapPayload.roads[0].width).toBe(30);

        await widthSliderThumb.focus();
        await page.keyboard.press('ArrowLeft');
        await expect(widthNumber).toHaveValue('29');

        state = await getEditorState(page);
        expect(state.serialized.mapPayload.roads[0].width).toBe(29);
    });

    test('migrated select controls dispatch updates to editor state', async ({ page }) => {
        await gotoEditor(page);

        const districtId = await page.evaluate(() => window.__EDITOR_TEST__.store.getState().document.index.groupIds.districts[0]);
        await page.evaluate((entityId) => {
            window.__EDITOR_TEST__.store.dispatch({ type: 'set-selection', selectedId: entityId });
        }, districtId);

        const districtType = page.getByTestId('field-district-type');
        await districtType.click();
        await page.getByRole('option', { name: 'windmill_farm' }).click();

        const state = await getEditorState(page);
        expect(state.serialized.mapPayload.districts[0].district_type).toBe('windmill_farm');
    });

    test('primary command buttons support keyboard activation', async ({ page }) => {
        await gotoEditor(page);

        const firstDistrictId = await page.evaluate(() => window.__EDITOR_TEST__.store.getState().document.index.groupIds.districts[0]);
        await page.evaluate((entityId) => {
            window.__EDITOR_TEST__.store.dispatch({ type: 'set-selection', selectedId: entityId });
        }, firstDistrictId);

        await page.getByTestId('field-coord-z').fill('1110');
        await page.getByTestId('field-coord-z').blur();

        const saveButton = page.getByTestId('save-button');
        await saveButton.focus();
        await expect(saveButton).toBeFocused();
        await page.keyboard.press('Enter');

        await expect(page.getByTestId('save-button')).toHaveText('Saved');
        await expect(page.getByTestId('dirty-state-chip')).toHaveText('Up to date');
    });

    test('toast and status feedback cover info and error flows', async ({ page }) => {
        await gotoEditor(page);

        await page.getByTestId('rebuild-world-button').click({ force: true });
        await expect(page.getByTestId('toast')).toHaveText(/world rebuild requested/i);

        const firstDistrictId = await page.evaluate(() => window.__EDITOR_TEST__.store.getState().document.index.groupIds.districts[0]);
        await page.evaluate((entityId) => {
            window.__EDITOR_TEST__.store.dispatch({ type: 'set-selection', selectedId: entityId });
        }, firstDistrictId);

        await page.route('**/save', async (route, request) => {
            const body = request.postDataJSON();
            if (body?.path === 'tools/map.json') {
                await route.fulfill({
                    status: 500,
                    contentType: 'text/plain',
                    body: 'Simulated save failure'
                });
                return;
            }
            await route.continue();
        });
        (page as EditorTestPage).__editorErrorWatch?.allowConsoleError(/Failed to load resource: the server responded with a status of 500/);

        await page.getByTestId('field-coord-z').fill('1120');
        await page.getByTestId('field-coord-z').blur();
        await expect(page.getByTestId('dirty-state-chip')).toHaveText('Unsaved changes');

        await page.getByTestId('save-button').click({ force: true });

        await expect(page.getByTestId('toast')).toHaveText(/save failed: simulated save failure/i);
        await expect(page.getByTestId('dirty-state-chip')).toHaveText('Unsaved changes');

        const state = await getEditorState(page);
        expect(state.saveState).toBe('error');

        await page.unroute('**/save');
    });
});

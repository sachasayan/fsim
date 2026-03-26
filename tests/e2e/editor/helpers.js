import { expect } from 'playwright/test';

export async function gotoEditor(page) {
    await page.goto('/editor.html');
    await expect(page.getByRole('heading', { name: /world editor/i })).toBeVisible();
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    await expect(page.getByTestId('toolbar')).toBeVisible();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await page.waitForFunction(() => window.__EDITOR_TEST__?.store != null);
}

export async function getEditorState(page) {
    return page.evaluate(() => {
        const store = window.__EDITOR_TEST__?.store;
        if (!store) throw new Error('Missing editor test store');
        const state = store.getState();
        const serialized = store.serialize();
        return {
            currentTool: state.tools.currentTool,
            selectedId: state.selection.selectedId,
            dirty: state.history.dirty,
            saveState: state.ui.saveState,
            undoCount: state.history.undoStack.length,
            serialized
        };
    });
}

export async function clickCanvas(page, x, y) {
    const box = await page.getByTestId('map-canvas').boundingBox();
    if (!box) throw new Error('Missing map canvas bounds');
    await page.mouse.click(box.x + x, box.y + y);
}

export async function hoverCanvas(page, x, y) {
    const box = await page.getByTestId('map-canvas').boundingBox();
    if (!box) throw new Error('Missing map canvas bounds');
    await page.mouse.move(box.x + x, box.y + y);
}

// @ts-check

import { expect } from 'playwright/test';

const ALLOWED_CONSOLE_PATTERNS = [
    /favicon\.ico/i
];

function shouldIgnoreConsoleMessage(message) {
    return ALLOWED_CONSOLE_PATTERNS.some(pattern => pattern.test(message));
}

export function attachEditorErrorWatch(page) {
    const failures = [];
    const allowedConsolePatterns = [...ALLOWED_CONSOLE_PATTERNS];

    page.on('console', async (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (shouldIgnoreConsoleMessage(text) || allowedConsolePatterns.some(pattern => pattern.test(text))) return;
        const location = msg.location();
        failures.push({
            type: 'console',
            text,
            location
        });
    });

    page.on('pageerror', (error) => {
        failures.push({
            type: 'pageerror',
            text: error?.stack || error?.message || String(error)
        });
    });

    return {
        allowConsoleError(pattern) {
            allowedConsolePatterns.push(pattern);
        },
        assertNoErrors() {
            expect(
                failures,
                failures.length === 0
                    ? 'Expected no browser console/page errors'
                    : `Unexpected browser errors:\n${failures.map((failure, index) => {
                        if (failure.type === 'console') {
                            const location = failure.location?.url
                                ? ` @ ${failure.location.url}:${failure.location.lineNumber}:${failure.location.columnNumber}`
                                : '';
                            return `${index + 1}. [console.error] ${failure.text}${location}`;
                        }
                        return `${index + 1}. [pageerror] ${failure.text}`;
                    }).join('\n')}`
            ).toEqual([]);
        }
    };
}

export async function gotoEditor(page) {
    await page.goto('/editor');
    await expect(page.getByTestId('command-strip')).toBeVisible();
    await expect(page.getByTestId('map-canvas')).toBeVisible();
    await expect(page.getByTestId('toolbar')).toBeVisible();
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
            groupVisibility: state.layers.groupVisibility,
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

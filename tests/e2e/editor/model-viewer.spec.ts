import { expect, test, type Page } from 'playwright/test';

import { attachEditorErrorWatch, gotoModelViewer } from './helpers';

type EditorErrorWatch = {
    allowConsoleError(pattern: RegExp): void;
    assertNoErrors(): void;
};

type ModelViewerTestPage = Page & {
    __editorErrorWatch?: EditorErrorWatch;
};

test.describe('model viewer workbench', () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(90_000);

    test.beforeEach(async ({ page }, testInfo) => {
        const modelViewerPage = page as ModelViewerTestPage;
        testInfo.annotations.push({ type: 'editor-error-watch', description: 'Fails on browser console.error and pageerror' });
        modelViewerPage.__editorErrorWatch = attachEditorErrorWatch(page);
    });

    test.afterEach(async ({ page }) => {
        (page as ModelViewerTestPage).__editorErrorWatch?.assertNoErrors();
    });

    test('loads the catalog, selects tree-1, and exposes impostor actions', async ({ page }) => {
        await gotoModelViewer(page);

        await expect(page.getByTestId('model-viewer-asset-tree-1')).toBeVisible();
        await expect(page.getByTestId('model-viewer-asset-tree-1')).not.toContainText(/tris/i);
        await page.getByTestId('model-viewer-search').fill('tree-1');
        await page.getByTestId('model-viewer-asset-tree-1').click();

        await expect(page.getByTestId('model-viewer-process-button')).toBeVisible();
        await expect(page.getByTestId('model-viewer-bake-button')).toBeEnabled();
        await expect(page.getByTestId('model-viewer-inspect-button')).toBeEnabled();
        await expect(page.getByTestId('model-viewer-diagnostics-button')).toBeEnabled();
        await expect(page.getByTestId('model-viewer-representation-impostor')).toBeEnabled();
        await expect(page.getByTestId('model-viewer-representation-sideBySide')).toBeEnabled();
        await expect(page.getByTestId('model-viewer-preview')).toHaveAttribute('data-ready', 'true');
        await expect(page.getByText('Preview unavailable')).toHaveCount(0);
        await expect(page.getByTestId('model-viewer-reset-view')).toBeVisible();
        await expect(page.getByTestId('model-viewer-fit-model')).toBeVisible();
        await expect(page.getByTestId('model-viewer-scene-status')).toContainText(/Ready/i);
        await expect(page.getByText('Camera Yaw')).toHaveCount(0);
        await expect(page.getByText('Camera Pitch')).toHaveCount(0);
        await expect(page.getByText('Camera Distance')).toHaveCount(0);
        await expect(page.getByTestId('field-target-triangles')).toHaveValue('12000');
        await expect(page.getByTestId('model-viewer-impostor-output-dir')).toHaveValue(/world\/impostors\/tree-1/);
        await expect(page.getByTestId('model-viewer-metadata-overview')).toContainText('Target triangles');
        await expect(page.getByTestId('model-viewer-metadata-overview')).toContainText('12,000 tris');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('Source triangles');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('49,664 tris');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('Decimated triangles');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('12,000 tris');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('Staged triangles');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('n/a');
        await expect(page.getByTestId('model-viewer-metadata-impostor')).toContainText('Capture ortho scale');
        await expect(page.getByTestId('model-viewer-metadata-impostor')).toContainText('Content rect');
        await expect(page.getByTestId('model-viewer-metadata-impostor')).toContainText('Bottom padding');

        const scrollState = await page.evaluate(() => {
            const main = document.querySelector('[data-testid="model-viewer-main-scroll"]');
            const inspector = document.querySelector('[data-testid="model-viewer-inspector-scroll"]');
            const catalog = document.querySelector('[data-testid="model-viewer-catalog"]');
            return {
                mainOverflow: main ? getComputedStyle(main).overflowY : null,
                inspectorOverflow: inspector ? getComputedStyle(inspector).overflowY : null,
                catalogExists: Boolean(catalog)
            };
        });
        expect(scrollState.catalogExists).toBe(true);
        expect(scrollState.mainOverflow).toBe('auto');
        expect(scrollState.inspectorOverflow).toBe('auto');

        await expect(page.getByTestId('model-viewer-secondary-tabs')).toBeVisible();
        await page.getByTestId('model-viewer-tab-logs').click();
        await expect(page.getByTestId('model-viewer-tab-panel-logs')).toBeVisible();
        await page.getByTestId('model-viewer-tab-artifacts').click();
        await expect(page.getByTestId('model-viewer-tab-panel-artifacts')).toBeVisible();
    });

    test('shows non-impostor assets without impostor controls failing', async ({ page }) => {
        await gotoModelViewer(page);

        await expect(page.getByTestId('model-viewer-asset-tree-1')).toBeVisible();
        await page.getByTestId('model-viewer-search').fill('barn');
        await page.getByTestId('model-viewer-asset-barn').click();

        await expect(page.getByTestId('model-viewer-bake-button')).toBeDisabled();
        await expect(page.getByTestId('model-viewer-inspect-button')).toBeDisabled();
        await expect(page.getByTestId('model-viewer-diagnostics-button')).toBeDisabled();
        await expect(page.getByTestId('model-viewer-representation-impostor')).toBeDisabled();
        await expect(page.getByTestId('model-viewer-representation-sideBySide')).toBeDisabled();
        await expect(page.getByTestId('model-viewer-preview')).toHaveAttribute('data-ready', 'true');

        await page.getByTestId('field-target-triangles').selectText();
        await page.getByTestId('field-target-triangles').fill('13000');
        await expect(page.getByTestId('field-target-triangles')).toHaveValue('13000');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('Source triangles');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('50,324 tris');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('Decimated triangles');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('12,000 tris');
        await expect(page.getByTestId('model-viewer-metadata-measured')).toContainText('Staged triangles');
    });
});

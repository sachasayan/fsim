import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('fsim.html accessibility attributes', () => {
    const htmlPath = path.join(ROOT, 'fsim.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // 1. Loader overlay should be a polite status region
    assert.match(
        htmlContent,
        /<div\s+id="loader"\s+role="status"\s+aria-live="polite"\s+aria-atomic="true"\s*>/i,
        'Loader overlay should have role="status", aria-live="polite", and aria-atomic="true"'
    );

    // 2. Spinner inside loader should be aria-hidden
    assert.match(
        htmlContent,
        /<div\s+class="spinner"\s+aria-hidden="true"\s*><\/div>/i,
        'Spinner should be aria-hidden="true"'
    );

    // 3. Warning overlay (STALL) should be an assertive alert
    assert.match(
        htmlContent,
        /<div\s+id="warning-overlay"\s+role="alert"\s+aria-live="assertive"\s+aria-atomic="true"\s*>STALL<\/div>/i,
        'Warning overlay should have role="alert", aria-live="assertive", and aria-atomic="true"'
    );

    // 4. Crash screen should be an assertive alert
    assert.match(
        htmlContent,
        /<div\s+id="crash-screen"\s+role="alert"\s+aria-live="assertive"\s+aria-atomic="true"\s*>/i,
        'Crash screen should have role="alert", aria-live="assertive", and aria-atomic="true"'
    );
});
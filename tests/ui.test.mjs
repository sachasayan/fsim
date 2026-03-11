import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('critical overlays have ARIA attributes', () => {
    const html = fs.readFileSync('fsim.html', 'utf8');

    // Check loader
    assert.match(html, /<div id="loader" role="status" aria-live="polite">/);

    // Check warning overlay
    assert.match(html, /<div id="warning-overlay" role="alert" aria-live="assertive">STALL<\/div>/);

    // Check crash screen
    assert.match(html, /<div id="crash-screen" role="alert" aria-live="assertive">/);
});

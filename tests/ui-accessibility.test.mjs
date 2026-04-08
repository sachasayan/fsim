import fs from 'node:fs';
import assert from 'node:assert';
import test from 'node:test';

test('fsim.html accessibility features', () => {
    const htmlContent = fs.readFileSync('fsim.html', 'utf-8');

    // Dashboard container
    assert.match(htmlContent, /<div id="dashboard"[^>]*role="group"/, 'Dashboard should have role="group"');
    assert.match(htmlContent, /<div id="dashboard"[^>]*aria-label="Flight Instruments"/, 'Dashboard should have aria-label="Flight Instruments"');

    // ND panel
    assert.match(htmlContent, /<div id="nd"[^>]*role="group"/, 'ND panel should have role="group"');
    assert.match(htmlContent, /<div id="nd"[^>]*aria-label="Navigation Display"/, 'ND panel should have aria-label="Navigation Display"');

    // EICAS panel
    assert.match(htmlContent, /<div id="eicas"[^>]*role="group"/, 'EICAS panel should have role="group"');
    assert.match(htmlContent, /<div id="eicas"[^>]*aria-label="Engine Indicating and Crew Alerting System"/, 'EICAS panel should have aria-label="Engine Indicating and Crew Alerting System"');
});

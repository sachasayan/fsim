import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('HTML Accessibility tests', async (t) => {
    const htmlPath = path.join(process.cwd(), 'fsim.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    await t.test('ND screen should have role=group and an aria-label', () => {
        assert.match(htmlContent, /id="nd"[^>]*role="group"/);
        assert.match(htmlContent, /id="nd"[^>]*aria-label="Navigation Display"/);
    });

    await t.test('Minimap canvas should have role=img and an aria-label', () => {
        assert.match(htmlContent, /id="minimap"[^>]*role="img"/);
        assert.match(htmlContent, /id="minimap"[^>]*aria-label="Interactive map showing aircraft position, heading, and terrain"/);
    });

    await t.test('EICAS screen should have role=group and an aria-label', () => {
        assert.match(htmlContent, /id="eicas"[^>]*role="group"/);
        assert.match(htmlContent, /id="eicas"[^>]*aria-label="Engine Indicating and Crew Alerting System"/);
    });
});

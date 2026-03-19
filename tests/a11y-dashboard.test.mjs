import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('dashboard screens have proper ARIA attributes', () => {
    const htmlPath = path.join(__dirname, '../fsim.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Test Navigation Display
    assert.match(
        htmlContent,
        /<div\s+id="nd"[^>]*role="group"/i,
        'Navigation Display should have role="group"'
    );
    assert.match(
        htmlContent,
        /<div\s+id="nd"[^>]*aria-label="Navigation Display"/i,
        'Navigation Display should have aria-label="Navigation Display"'
    );

    // Test EICAS Display
    assert.match(
        htmlContent,
        /<div\s+id="eicas"[^>]*role="group"/i,
        'EICAS Display should have role="group"'
    );
    assert.match(
        htmlContent,
        /<div\s+id="eicas"[^>]*aria-label="Engine Indicating and Crew Alerting System"/i,
        'EICAS Display should have aria-label="Engine Indicating and Crew Alerting System"'
    );
});

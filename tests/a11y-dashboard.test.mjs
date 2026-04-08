import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('Flight dashboard accessibility groups', () => {
    const html = fs.readFileSync('fsim.html', 'utf8');

    // Verify ND (Navigation Display) has role group and label
    assert.match(html, /<div id="nd"\s+class="screen"\s+role="group"\s+aria-label="Navigation Display">/);

    // Verify EICAS has role group and label
    assert.match(html, /<div id="eicas"\s+class="screen"\s+role="group"\s+aria-label="Engine Indicating and Crew Alerting System">/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { isTerrainBrushTool } from '../js/modules/editor/constants.js';

test('isTerrainBrushTool excludes terrain-region while keeping sculpt brushes', () => {
    assert.equal(isTerrainBrushTool('terrain-raise'), true);
    assert.equal(isTerrainBrushTool('terrain-lower'), true);
    assert.equal(isTerrainBrushTool('terrain-flatten'), true);
    assert.equal(isTerrainBrushTool('terrain-region'), false);
    assert.equal(isTerrainBrushTool('select'), false);
});

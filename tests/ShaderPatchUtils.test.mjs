import test from 'node:test';
import assert from 'node:assert/strict';

import {
    appendMaterialProgramCacheKey,
    replaceShaderInclude,
    replaceShaderSnippet
} from '../js/modules/world/shaders/ShaderPatchUtils.js';

test('replaceShaderInclude throws when the shader chunk is missing', () => {
    assert.throws(
        () => replaceShaderInclude('void main() {}', 'common', '#include <common>'),
        /Missing shader include <common>/
    );
});

test('replaceShaderSnippet throws when the target snippet is missing', () => {
    assert.throws(
        () => replaceShaderSnippet('void main() {}', 'vec4 diffuseColor = vec4( diffuse, opacity );', 'replacement'),
        /Missing shader snippet/
    );
});

test('appendMaterialProgramCacheKey preserves the previous cache key', () => {
    const material = {
        customProgramCacheKey() {
            return 'base-key';
        }
    };

    appendMaterialProgramCacheKey(material, '-extra');

    assert.equal(material.customProgramCacheKey(), 'base-key-extra');
});

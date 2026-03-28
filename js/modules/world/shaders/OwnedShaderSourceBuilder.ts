// @ts-check

/**
 * @typedef ShaderContractRequirement
 * @property {string | RegExp} pattern
 * @property {string} description
 * @property {boolean} [present]
 */

/**
 * @typedef OwnedShaderSource
 * @property {string} vertexShader
 * @property {string} fragmentShader
 * @property {Record<string, unknown>} defines
 */

/**
 * @typedef ShaderLike
 * @property {string} [vertexShader]
 * @property {string} [fragmentShader]
 * @property {Record<string, unknown>} [defines]
 */

/**
 * @param {string} source
 * @param {ShaderContractRequirement[]} [requirements]
 * @param {'vertex' | 'fragment'} [kind]
 * @param {string} [label]
 */
function assertShaderContracts(source, requirements = [], kind = 'fragment', label = 'owned shader') {
    for (const requirement of requirements) {
        const {
            pattern,
            description,
            present = true
        } = requirement;
        const matches = typeof pattern === 'string'
            ? source.includes(pattern)
            : pattern.test(source);
        if (matches !== present) {
            const expectation = present ? 'missing required' : 'contains forbidden';
            throw new Error(`${label} ${kind} shader ${expectation} contract: ${description}`);
        }
    }
}

/**
 * @param {string[]} keys
 * @returns {Record<string, { value: null }>}
 */
export function makePlaceholderUniformMap(keys) {
    return Object.fromEntries(keys.map((key) => [key, { value: null }]));
}

/**
 * @param {{
 *   label?: string,
 *   shader: ShaderLike | null | undefined,
 *   requiredVertex?: ShaderContractRequirement[],
 *   requiredFragment?: ShaderContractRequirement[],
 *   forbiddenVertex?: ShaderContractRequirement[],
 *   forbiddenFragment?: ShaderContractRequirement[]
 * }} options
 * @returns {OwnedShaderSource}
 */
export function finalizeOwnedShaderSource({
    label = 'owned shader',
    shader,
    requiredVertex = [],
    requiredFragment = [],
    forbiddenVertex = [],
    forbiddenFragment = []
}) {
    const vertexShader = shader?.vertexShader || '';
    const fragmentShader = shader?.fragmentShader || '';

    assertShaderContracts(vertexShader, requiredVertex, 'vertex', label);
    assertShaderContracts(fragmentShader, requiredFragment, 'fragment', label);
    assertShaderContracts(vertexShader, forbiddenVertex.map((entry) => ({ ...entry, present: false })), 'vertex', label);
    assertShaderContracts(fragmentShader, forbiddenFragment.map((entry) => ({ ...entry, present: false })), 'fragment', label);

    return {
        vertexShader,
        fragmentShader,
        defines: shader?.defines || {}
    };
}

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

export function makePlaceholderUniformMap(keys) {
    return Object.fromEntries(keys.map((key) => [key, { value: null }]));
}

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

function normalizeVariantEntry(entry) {
    if (!entry) return null;

    if (typeof entry === 'function') {
        return {
            id: entry.shaderProviderId || entry.name || null,
            build: entry
        };
    }

    if (typeof entry.build !== 'function') {
        throw new Error(`Shader variant "${entry.id || 'unknown'}" is missing a build() function`);
    }

    return entry;
}

export function createShaderVariantRegistry() {
    return {
        variants: new Map()
    };
}

export function registerShaderVariant(registry, entry) {
    const normalized = normalizeVariantEntry(entry);
    if (!normalized) return;

    if (!registry?.variants || !(registry.variants instanceof Map)) {
        throw new Error('Invalid shader variant registry');
    }
    if (!normalized.id) {
        throw new Error('Shader variant entries require a stable id');
    }
    if (registry.variants.has(normalized.id)) {
        throw new Error(`Duplicate shader variant id "${normalized.id}"`);
    }

    registry.variants.set(normalized.id, normalized);
}

export function registerShaderVariants(registry, entries = []) {
    for (const entry of entries) {
        if (Array.isArray(entry)) {
            registerShaderVariants(registry, entry);
            continue;
        }
        registerShaderVariant(registry, entry);
    }
}

export function listShaderVariants(registry) {
    if (!registry?.variants || !(registry.variants instanceof Map)) {
        return [];
    }
    return Array.from(registry.variants.values());
}

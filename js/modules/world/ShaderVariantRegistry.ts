// @ts-check

/**
 * @typedef {{
 *   id?: string | null,
 *   shaderVariantId?: string | null,
 *   shaderProviderId?: string | null,
 *   metadata?: unknown,
 *   build: (...args: unknown[]) => unknown
 * }} ShaderVariantEntry
 */

/** @typedef {ShaderVariantEntry['build'] & { shaderVariantId?: string | null, shaderProviderId?: string | null }} ShaderVariantBuilder */

/**
 * @typedef {{
 *   variants: Map<string, ShaderVariantEntry>
 * }} ShaderVariantRegistry
 */

/**
 * @param {unknown} entry
 * @returns {ShaderVariantEntry | null}
 */
function normalizeVariantEntry(entry) {
    if (!entry) return null;

    if (typeof entry === 'function') {
        const builder = /** @type {ShaderVariantBuilder} */ (entry);
        return {
            id: builder.shaderProviderId || builder.name || null,
            build: builder
        };
    }

    const variantEntry = /** @type {Partial<ShaderVariantEntry>} */ (entry);
    if (typeof variantEntry.build !== 'function') {
        throw new Error(`Shader variant "${variantEntry.id || 'unknown'}" is missing a build() function`);
    }

    return /** @type {ShaderVariantEntry} */ (variantEntry);
}

/**
 * @returns {ShaderVariantRegistry}
 */
export function createShaderVariantRegistry() {
    return {
        variants: new Map()
    };
}

/**
 * @param {ShaderVariantRegistry} registry
 * @param {unknown} entry
 */
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

/**
 * @param {ShaderVariantRegistry} registry
 * @param {unknown[]} [entries]
 */
export function registerShaderVariants(registry, entries = []) {
    for (const entry of entries) {
        if (Array.isArray(entry)) {
            registerShaderVariants(registry, entry);
            continue;
        }
        registerShaderVariant(registry, entry);
    }
}

/**
 * @param {ShaderVariantRegistry | null | undefined} registry
 * @returns {ShaderVariantEntry[]}
 */
export function listShaderVariants(registry) {
    if (!registry?.variants || !(registry.variants instanceof Map)) {
        return [];
    }
    return Array.from(registry.variants.values());
}

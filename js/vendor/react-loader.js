// @ts-check

const moduleCache = new Map();

function createRequire(registry) {
    return function requireModule(specifier) {
        if (!registry.has(specifier)) {
            throw new Error(`Unsupported CommonJS dependency: ${specifier}`);
        }
        return registry.get(specifier);
    };
}

async function loadCommonJsModule(url, registry) {
    if (moduleCache.has(url)) return moduleCache.get(url);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load module: ${url}`);
    }

    const source = await response.text();
    const module = { exports: {} };
    const requireModule = createRequire(registry);
    const process = { env: { NODE_ENV: 'development' } };
    const factory = new Function(
        'require',
        'module',
        'exports',
        'process',
        'global',
        'window',
        'self',
        `${source}\nreturn module.exports;`
    );
    const exportsValue = factory(requireModule, module, module.exports, process, window, window, window);
    moduleCache.set(url, exportsValue);
    return exportsValue;
}

const registry = new Map();

const Scheduler = await loadCommonJsModule('/node_modules/scheduler/cjs/scheduler.development.js', registry);
registry.set('scheduler', Scheduler);

const React = await loadCommonJsModule('/node_modules/react/cjs/react.development.js', registry);
registry.set('react', React);

const ReactDOM = await loadCommonJsModule('/node_modules/react-dom/cjs/react-dom.development.js', registry);
registry.set('react-dom', ReactDOM);

const ReactDOMClient = await loadCommonJsModule('/node_modules/react-dom/cjs/react-dom-client.development.js', registry);

export { React, ReactDOM, ReactDOMClient };

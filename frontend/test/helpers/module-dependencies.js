import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { Linter } from 'eslint';

const linter = new Linter();

export function moduleDependencies(source, filename = 'source.jsx') {
  const dependencies = [];
  const collect = (node, dynamic = false) => {
    if (node.source) dependencies.push({ source: node.source.value, dynamic });
  };
  const messages = linter.verify(
    source,
    [
      {
        files: ['**/*.{js,jsx,mjs}'],
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } }
        },
        plugins: {
          architecture: {
            rules: {
              dependencies: {
                create: () => ({
                  ImportDeclaration: (node) => collect(node),
                  ExportNamedDeclaration: (node) => collect(node),
                  ExportAllDeclaration: (node) => collect(node),
                  ImportExpression: (node) => collect(node, true)
                })
              }
            }
          }
        },
        rules: { 'architecture/dependencies': 'error' }
      }
    ],
    { filename, allowInlineConfig: false }
  );
  if (messages.length) {
    throw new Error(`Cannot inspect dependencies in ${filename}: ${JSON.stringify(messages)}`);
  }
  return dependencies;
}

// Follow local static imports and re-exports, including side-effect imports. Package imports
// remain leaves; this guards source reachability, not bundler tree-shaking or network transfer.
export function createModuleGraph(read = (path) => readFileSync(path, 'utf8')) {
  const projectRoot = resolve();
  const cache = new Map();
  const sources = new Map();
  const sourceOf = (path) => {
    if (!sources.has(path)) sources.set(path, read(path));
    return sources.get(path);
  };
  const resolveLocal = (importer, specifier) => {
    const modulePath = specifier.split('?')[0];
    // Vite resolves /src/... from the frontend project root, not as a package import.
    const path = modulePath.startsWith('/')
      ? resolve(projectRoot, modulePath.slice(1))
      : resolve(dirname(importer), modulePath);
    if (extname(path)) return path;
    for (const suffix of ['.mjs', '.js', '.jsx', '/index.mjs', '/index.js', '/index.jsx']) {
      try {
        sourceOf(`${path}${suffix}`);
        return `${path}${suffix}`;
      } catch (error) {
        if (!['ENOENT', 'EISDIR'].includes(error.code)) throw error;
      }
    }
    throw new Error(`Cannot resolve local module ${specifier} from ${importer}`);
  };
  const dependenciesOf = (path) => {
    const absolute = resolve(path);
    if (!cache.has(absolute)) {
      cache.set(absolute, moduleDependencies(sourceOf(absolute), absolute));
    }
    return cache.get(absolute);
  };
  const staticReachableFrom = (entry) => {
    const modules = new Set();
    const packages = new Set();
    const visit = (path) => {
      if (modules.has(path)) return;
      modules.add(path);
      if (
        ['.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extname(path))
      )
        return;
      if (!['.js', '.jsx', '.mjs'].includes(extname(path))) {
        throw new Error(`Cannot inspect module type: ${path}`);
      }
      for (const dependency of dependenciesOf(path)) {
        if (dependency.dynamic) continue;
        if (dependency.source.startsWith('.') || dependency.source.startsWith('/')) {
          visit(resolveLocal(path, dependency.source));
        } else {
          packages.add(dependency.source);
        }
      }
    };
    visit(resolve(entry));
    return { modules, packages };
  };
  return { dependenciesOf, staticReachableFrom };
}

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceExtensions = new Set(['.js', '.jsx']);

function collectSourceFiles(root) {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);

    if (statSync(path).isDirectory()) {
      return collectSourceFiles(path);
    }

    return sourceExtensions.has(extname(path)) ? [path] : [];
  });
}

export function extractImportSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const candidate = resolve(dirname(importer), specifier);
  const candidates = extname(candidate)
    ? [candidate]
    : [`${candidate}.js`, `${candidate}.jsx`, resolve(candidate, 'index.js')];

  return candidates.find((path) => existsSync(path)) || candidate;
}

function layerOf(path) {
  if (/\.routes\.js$/.test(path)) return 'route';
  if (/\.controller\.js$/.test(path)) return 'controller';
  if (/\.service\.js$/.test(path)) return 'service';
  if (/\.repository\.js$/.test(path)) return 'repository';
  if (/\.client\.js$/.test(path)) return 'client';
  return null;
}

function moduleOf(path, backendRoot) {
  const normalized = relative(backendRoot, path).split(sep);
  const modulesIndex = normalized.indexOf('modules');

  return modulesIndex >= 0 ? normalized[modulesIndex + 1] : null;
}

function addViolation(violations, file, rule, specifier, message) {
  violations.push({ file, rule, specifier, message });
}

function inspectBackendImports(files, backendRoot, violations, graph) {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const layer = layerOf(file);
    const relativeFile = relative(backendRoot, file).split(sep);
    const isShared = relativeFile.includes('shared');
    const isMiddleware = relativeFile.includes('middlewares');
    const isLogger = isShared && relativeFile.includes('logger');
    const isErrorHandler = relativeFile.at(-1) === 'error-handler.middleware.js';
    const isValidationMiddleware = relativeFile.at(-1) === 'validate-request.middleware.js';
    const isSchema = /\.(?:schema|validation)\.js$/.test(file);
    const imports = extractImportSpecifiers(source);

    graph.set(file, []);

    for (const specifier of imports) {
      const target = resolveImport(file, specifier);
      const targetLayer = target ? layerOf(target) : null;
      const databaseImport =
        specifier === '@prisma/client' ||
        specifier.includes('/database/') ||
        specifier.includes('prismaClient');

      if (target && files.includes(target)) {
        graph.get(file).push(target);
      }

      if (layer === 'route' && targetLayer === 'repository') {
        addViolation(violations, file, 'route-no-repository', specifier, 'Route não pode importar repository.');
      }

      if (layer === 'route' && databaseImport) {
        addViolation(violations, file, 'route-no-database', specifier, 'Route não pode acessar Prisma/database.');
      }

      if (layer === 'controller' && targetLayer === 'repository') {
        addViolation(violations, file, 'controller-no-repository', specifier, 'Controller não pode importar repository.');
      }

      if (layer === 'controller' && databaseImport) {
        addViolation(violations, file, 'controller-no-database', specifier, 'Controller não pode acessar Prisma/database.');
      }

      if (layer === 'repository' && targetLayer === 'controller') {
        addViolation(violations, file, 'repository-no-controller', specifier, 'Repository não pode importar controller.');
      }

      if (layer === 'repository' && targetLayer === 'route') {
        addViolation(violations, file, 'repository-no-route', specifier, 'Repository não pode importar route.');
      }

      if (layer === 'repository' && specifier === 'express') {
        addViolation(violations, file, 'repository-no-http', specifier, 'Repository não pode conhecer HTTP/Express.');
      }

      if (isShared && target && moduleOf(target, backendRoot)) {
        addViolation(violations, file, 'shared-no-domain', specifier, 'Shared não pode importar módulo de domínio.');
      }

      if (isMiddleware && targetLayer === 'repository') {
        addViolation(violations, file, 'middleware-no-repository', specifier, 'Middleware não pode importar repository.');
      }

      if (isLogger && specifier === 'express') {
        addViolation(violations, file, 'logger-no-express', specifier, 'Logger não pode importar Express.');
      }

      if (isErrorHandler && targetLayer === 'service' && target && moduleOf(target, backendRoot)) {
        addViolation(violations, file, 'error-handler-no-domain-service', specifier, 'Error handler não pode importar service de domínio.');
      }

      if (isSchema && targetLayer === 'controller') {
        addViolation(violations, file, 'schema-no-controller', specifier, 'Schema não pode importar controller.');
      }

      if (isSchema && targetLayer === 'repository') {
        addViolation(violations, file, 'schema-no-repository', specifier, 'Schema não pode importar repository.');
      }

      if (isSchema && specifier === 'express') {
        addViolation(violations, file, 'schema-no-express', specifier, 'Schema de domínio não pode importar Express.');
      }

      if (isValidationMiddleware && targetLayer === 'service') {
        addViolation(violations, file, 'validation-middleware-no-service', specifier, 'Middleware de validação não pode importar service.');
      }
    }
  }

  detectModuleCycles(graph, backendRoot, violations);
}

function detectModuleCycles(graph, backendRoot, violations) {
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const reported = new Set();

  function visit(file) {
    visited.add(file);
    active.add(file);
    stack.push(file);

    for (const target of graph.get(file) || []) {
      if (moduleOf(file, backendRoot) !== moduleOf(target, backendRoot)) {
        continue;
      }

      if (!visited.has(target)) {
        visit(target);
      } else if (active.has(target)) {
        const start = stack.indexOf(target);
        const cycle = [...stack.slice(start), target];
        const key = cycle.join('>');

        if (!reported.has(key)) {
          reported.add(key);
          addViolation(
            violations,
            file,
            'module-no-cycle',
            relative(backendRoot, target),
            `Ciclo no módulo: ${cycle.map((item) => relative(backendRoot, item)).join(' -> ')}`
          );
        }
      }
    }

    stack.pop();
    active.delete(file);
  }

  for (const file of graph.keys()) {
    if (!visited.has(file)) visit(file);
  }
}

function inspectFrontendImports(files, frontendRoot, violations) {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = relative(frontendRoot, file).split(sep);
    const isShared = relativeFile.includes('shared');

    for (const specifier of extractImportSpecifiers(source)) {
      const target = resolveImport(file, specifier);
      const leavesFrontend = target && !relative(frontendRoot, target).startsWith('..');
      const referencesBackend =
        specifier.includes('backend/') ||
        specifier.startsWith('backend') ||
        (target && target.split(sep).includes('backend'));

      if (referencesBackend || (target && !leavesFrontend)) {
        addViolation(
          violations,
          file,
          'frontend-no-backend-internals',
          specifier,
          'Frontend não pode importar internals do backend.'
        );
      }


      if (isShared && target && relative(frontendRoot, target).split(sep).includes('pages')) {
        addViolation(
          violations,
          file,
          'frontend-shared-no-pages',
          specifier,
          'Frontend shared não pode importar pages.'
        );
      }
    }
  }
}

export function checkArchitecture({ backendRoot, frontendRoot }) {
  const resolvedBackendRoot = resolve(backendRoot);
  const resolvedFrontendRoot = resolve(frontendRoot);
  const backendFiles = collectSourceFiles(resolvedBackendRoot);
  const frontendFiles = collectSourceFiles(resolvedFrontendRoot);
  const violations = [];

  inspectBackendImports(backendFiles, resolvedBackendRoot, violations, new Map());
  inspectFrontendImports(frontendFiles, resolvedFrontendRoot, violations);

  return violations.map((violation) => ({
    ...violation,
    file: relative(process.cwd(), violation.file)
  }));
}

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function runCli() {
  const violations = checkArchitecture({
    backendRoot: readArgument('--backend-root', resolve(process.cwd(), 'src')),
    frontendRoot: readArgument('--frontend-root', resolve(process.cwd(), '../frontend/src'))
  });

  if (violations.length === 0) {
    console.log('Architecture check passed: nenhuma violação encontrada.');
    return;
  }

  console.error(`Architecture check failed: ${violations.length} violação(ões).`);
  for (const violation of violations) {
    console.error(`- ${violation.file}: [${violation.rule}] ${violation.message} Import: ${violation.specifier}`);
  }
  process.exitCode = 1;
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) runCli();

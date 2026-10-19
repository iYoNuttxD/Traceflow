const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function mountPath(layer) {
  if (layer.regexp?.fast_slash) return '';
  let keyIndex = 0;
  return layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, () => `:${layer.keys[keyIndex++].name}`)
    .replace(/\\\//g, '/');
}

function join(prefix, path) {
  const joined = `${prefix}${path === '/' && prefix ? '' : path}`;
  return joined.replace(/\/{2,}/g, '/') || '/';
}

function walk(stack, prefix, routes, middlewares, counter) {
  for (const layer of stack) {
    counter.order += 1;
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const path of paths) {
        for (const method of METHODS) {
          if (!layer.route.methods[method]) continue;
          routes.push({
            order: counter.order,
            method: method.toUpperCase(),
            path: join(prefix, path),
            handlers: layer.route.stack.map((item) => item.handle.name || 'anonymous')
          });
        }
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      walk(layer.handle.stack, join(prefix, mountPath(layer)), routes, middlewares, counter);
    } else {
      middlewares.push({
        order: counter.order,
        path: join(prefix, mountPath(layer)),
        name: layer.name || 'anonymous'
      });
    }
  }
}

export function inventoryRoutes(app) {
  const routes = [];
  const middlewares = [];
  walk(app._router.stack, '', routes, middlewares, { order: 0 });
  const unique = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));
  return {
    routes: [...unique.values()].sort((a, b) =>
      a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)
    ),
    middlewares
  };
}

export function guardedBy(route, middlewares, name) {
  return middlewares.some(
    (layer) =>
      layer.name === name &&
      layer.order < route.order &&
      (route.path === layer.path || route.path.startsWith(`${layer.path}/`) || layer.path === '/')
  );
}

export function concretePath(path, values = {}) {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, name) => String(values[name] ?? 999999999));
}

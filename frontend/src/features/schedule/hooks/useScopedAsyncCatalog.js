import { useLayoutEffect, useMemo, useRef } from 'react';

// One identity per project visit and independent versions for its projections.
// Tokens stay authoritative even when transport ignores cancellation.
export function useScopedAsyncCatalog(projectId) {
  const generation = useRef(0);
  const current = useRef(null);
  const scope = useMemo(() => {
    const resources = new Map();
    const state = { projectId, generation: 0 };
    const resource = (name) => {
      if (!resources.has(name)) resources.set(name, { version: 0, request: null });
      return resources.get(name);
    };
    const capture = () => ({ projectId, generation: state.generation, state });
    const isCurrent = (token) =>
      !!token &&
      current.current === state &&
      token.state === state &&
      token.projectId === projectId &&
      token.generation === state.generation;
    const isVersionCurrent = (token, name) =>
      isCurrent(token) &&
      (token.versions?.[name] == null || token.versions[name] === resource(name).version);
    const invalidate = (token, names) => {
      if (!isCurrent(token)) return null;
      for (const name of names) {
        const item = resource(name);
        item.version += 1;
        item.request?.controller.abort();
        item.request = null;
      }
      return {
        ...token,
        versions: Object.fromEntries([...resources].map(([name, item]) => [name, item.version]))
      };
    };
    const beginRead = (name, token = capture()) => {
      if (!isVersionCurrent(token, name)) return null;
      const item = resource(name);
      item.request?.controller.abort();
      const request = { ...token, version: item.version, controller: new AbortController() };
      item.request = request;
      return request;
    };
    const isReadCurrent = (name, request) =>
      isCurrent(request) &&
      resource(name).version === request.version &&
      resource(name).request === request;
    const cancel = () => {
      for (const item of resources.values()) item.request?.controller.abort();
    };
    return { state, capture, isCurrent, invalidate, beginRead, isReadCurrent, cancel };
  }, [projectId]);

  useLayoutEffect(() => {
    scope.state.generation = ++generation.current;
    current.current = scope.state;
    return () => {
      current.current = null;
      scope.cancel();
    };
  }, [scope]);
  return scope;
}

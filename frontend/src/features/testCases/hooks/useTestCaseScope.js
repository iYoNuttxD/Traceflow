import { useLayoutEffect, useMemo, useRef } from 'react';

// Project visit + resource identity + request generation. Abort is only transport cleanup.
export function useTestCaseScope(identity) {
  const current = useRef(null);
  const scope = useMemo(() => {
    const state = { identity, generation: 0, reads: new Map() };
    const capture = () => ({ state, generation: state.generation });
    const valid = (token) =>
      current.current === state && token.state === state && token.generation === state.generation;
    const cancel = () => {
      state.reads.forEach((r) => r.controller.abort());
      state.reads.clear();
    };
    return {
      capture,
      valid,
      cancelRead(name) {
        state.reads.get(name)?.controller.abort();
        state.reads.delete(name);
      },
      invalidate() {
        state.generation += 1;
        cancel();
      },
      begin(name) {
        state.reads.get(name)?.controller.abort();
        const token = { ...capture(), controller: new AbortController() };
        state.reads.set(name, token);
        return token;
      },
      accepts(name, token) {
        return valid(token) && state.reads.get(name) === token;
      },
      activate() {
        current.current = state;
        state.generation += 1;
      },
      dispose() {
        current.current = null;
        state.generation += 1;
        cancel();
      }
    };
  }, [identity]);
  useLayoutEffect(() => {
    scope.activate();
    return () => scope.dispose();
  }, [scope]);
  return scope;
}

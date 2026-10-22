/** Preserve GitHub integer lexemes before any unsafe Number conversion (Node 22). */
export function parseGithubJson(text, { rawIntegers = false } = {}) {
  return JSON.parse(text, (_key, value, context) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || Number.isSafeInteger(value))
      return value;
    if (!context || !/^-?(0|[1-9]\d*)$/.test(context.source))
      throw new Error('GITHUB_UNSAFE_JSON_INTEGER');
    return rawIntegers ? JSON.rawJSON(context.source) : context.source;
  });
}

export function githubId(value) {
  if (JSON.isRawJSON(value)) value = value.rawJSON;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('GITHUB_UNSAFE_ID');
    value = String(value);
  }
  if (typeof value !== 'string' || !/^[1-9]\d{0,39}$/.test(value))
    throw new Error('GITHUB_INVALID_ID');
  return value;
}

/** Octokit reads text() before JSON.parse; normalize there, never after rounding. */
export function githubFetch(fetchImpl = globalThis.fetch) {
  return async (...args) => {
    const response = await fetchImpl(...args);
    if (
      !/^(application\/(?:[\w.+-]*\+)?json)(?:;|$)/i.test(
        response.headers.get('content-type') || ''
      )
    )
      return response;
    return new Proxy(response, {
      get(target, property) {
        if (property === 'text')
          return async () => JSON.stringify(parseGithubJson(await target.text()));
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };
}

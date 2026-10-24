export function validateProductionEnvironment(environment) {
  const allowed = new Set(['VITE_API_URL', 'VITE_API_TIMEOUT_MS']);
  if (Object.keys(environment).some((key) => key.startsWith('VITE_') && !allowed.has(key))) {
    throw new Error(
      'Variável VITE não autorizada: frontend aceita somente API URL e timeout públicos.'
    );
  }
  if (environment.VITE_API_URL && environment.VITE_API_URL !== '/api') {
    throw new Error('VITE_API_URL deve ser /api no build de produção.');
  }
  if (
    environment.VITE_API_TIMEOUT_MS &&
    (!/^\d+$/.test(environment.VITE_API_TIMEOUT_MS) || Number(environment.VITE_API_TIMEOUT_MS) < 1)
  ) {
    throw new Error('VITE_API_TIMEOUT_MS deve ser um inteiro positivo.');
  }
  return '/api';
}

export function validateProductionBundle(bundle) {
  const assets = Object.values(bundle);
  if (!assets.some((asset) => asset.fileName === 'index.html'))
    throw new Error('SPA index.html ausente.');
  for (const asset of assets) {
    if (!/\.(js|html|css)$/.test(asset.fileName)) continue;
    const content = String(asset.code ?? asset.source);
    // Axios contains a non-browser URL-parsing fallback to http://localhost. Only an
    // operational local API endpoint is forbidden here, not that inert library literal.
    if (
      /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?\/api(?:[/"'`?]|$)/i.test(
        content
      )
    ) {
      throw new Error('Bundle contém URL operacional de API local.');
    }
    if (
      /mysql:\/\/|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}/.test(content)
    ) {
      throw new Error('Bundle contém padrão de credencial proibido.');
    }
  }
}

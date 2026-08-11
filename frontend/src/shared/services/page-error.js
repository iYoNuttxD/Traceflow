export const PAGE_ERROR_TYPES = Object.freeze({
  NETWORK: 'NETWORK',
  SERVER: 'SERVER',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNKNOWN: 'UNKNOWN'
});

const SESSION_ERROR_CODES = new Set([
  'AUTHENTICATION_REQUIRED',
  'SESSION_INVALID',
  'SESSION_EXPIRED'
]);

function originalError(error) {
  return error?.original || error;
}

export function getErrorStatus(error) {
  const status = error?.status ?? originalError(error)?.response?.status;
  return Number.isInteger(status) ? status : undefined;
}

export function getErrorCode(error) {
  const source = originalError(error);
  return source?.response?.data?.code || error?.code || source?.code;
}

export function getErrorRequestId(error) {
  const source = originalError(error);
  const requestId =
    error?.requestId ||
    source?.response?.data?.requestId ||
    source?.response?.headers?.['x-request-id'] ||
    source?.response?.headers?.get?.('x-request-id');
  return typeof requestId === 'string' && requestId.trim() ? requestId.trim() : undefined;
}

export function isAuthenticationFailure(error) {
  return getErrorStatus(error) === 401 && SESSION_ERROR_CODES.has(getErrorCode(error));
}

export function isNetworkOrServiceUnavailable(error) {
  const status = getErrorStatus(error);
  if ([502, 503, 504].includes(status)) return true;
  if (status !== undefined) return false;

  const source = originalError(error);
  const code = getErrorCode(error);
  if (
    [
      'ERR_CANCELED',
      'ECONNABORTED',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ERR_CONNECTION_REFUSED'
    ].includes(code)
  ) {
    return code !== 'ERR_CANCELED';
  }

  return (
    code === 'ERR_NETWORK' ||
    (source?.isAxiosError === true && !source.response) ||
    Boolean(source?.request && !source.response)
  );
}

export function classifyPageError(error) {
  const status = getErrorStatus(error);
  if (status === 404) return PAGE_ERROR_TYPES.NOT_FOUND;
  if (status === 403) return PAGE_ERROR_TYPES.FORBIDDEN;
  if (isNetworkOrServiceUnavailable(error)) return PAGE_ERROR_TYPES.NETWORK;
  if (status !== undefined && status >= 500) return PAGE_ERROR_TYPES.SERVER;
  return PAGE_ERROR_TYPES.UNKNOWN;
}

export function resolveErrorPageContext(pathname = '/') {
  const path = typeof pathname === 'string' ? pathname : '/';
  const authPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

  if (authPaths.some((route) => path === route || path.startsWith(`${route}/`))) {
    return {
      name: 'authentication',
      secondaryAction: path === '/login' ? null : { label: 'Ir para o login', href: '/login' }
    };
  }

  if (path === '/projects') {
    return {
      name: 'projects',
      secondaryAction: { label: 'Ir para o início', href: '/' }
    };
  }

  const projectMatch = path.match(/^\/projects\/([^/]+)(?:\/.*)?$/);
  if (projectMatch) {
    const projectPath = `/projects/${encodeURIComponent(projectMatch[1])}`;
    return {
      name: 'project',
      secondaryAction:
        path === projectPath
          ? { label: 'Voltar aos projetos', href: '/projects' }
          : { label: 'Voltar ao projeto', href: projectPath }
    };
  }

  if (path === '/settings' || path.startsWith('/settings/')) {
    return {
      name: 'settings',
      secondaryAction: { label: 'Ir para projetos', href: '/projects' }
    };
  }

  if (path === '/restricted' || path.startsWith('/restricted/')) {
    return {
      name: 'restricted',
      secondaryAction: { label: 'Ir para minha conta', href: '/settings/account' }
    };
  }

  return {
    name: 'unknown',
    secondaryAction: { label: 'Ir para o início', href: '/' }
  };
}

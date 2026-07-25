import helmet from 'helmet';

export function createSecurityHeadersMiddleware({ isProduction }) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    referrerPolicy: { policy: 'no-referrer' }
  });
}

export function noStoreApiResponses(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

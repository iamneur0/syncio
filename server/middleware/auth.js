// Auth and CSRF middlewares (factory-style for DI/testing)
module.exports.createAuthGate = function createAuthGate({ AUTH_ENABLED, PRIVATE_AUTH_ENABLED, JWT_SECRET, pathIsAllowlisted, parseCookies, cookieName, extractBearerToken, issueAccessToken, randomCsrfToken, isProdEnv, jsonwebtoken }) {
  const jwt = jsonwebtoken || require('jsonwebtoken')
  return function authGate(req, res, next) {
    if (!AUTH_ENABLED && !PRIVATE_AUTH_ENABLED) return next();
    if (req.method === 'OPTIONS') return next();
    if (pathIsAllowlisted(req.path)) return next();

    const cookies = parseCookies(req);
    const accessCookie = cookies[cookieName('sfm_at')] || cookies['sfm_at'];
    const refreshCookie = cookies[cookieName('sfm_rt')] || cookies['sfm_rt'];
    const bearer = extractBearerToken(req);
    const token = bearer || accessCookie;
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.appAccountId = decoded.accId;
      return next();
    } catch (e) {
      if (refreshCookie) {
        try {
          const rj = jwt.verify(refreshCookie, JWT_SECRET);
          if (rj && rj.accId) {
            const newAt = issueAccessToken(rj.accId);
            res.cookie(cookieName('sfm_at'), newAt, {
              httpOnly: true,
              secure: isProdEnv(),
              sameSite: isProdEnv() ? 'strict' : 'lax',
              path: '/',
              maxAge: 30 * 24 * 60 * 60 * 1000,
            });
            // Also refresh CSRF token when access token is refreshed
            if (randomCsrfToken) {
              const newCsrf = randomCsrfToken();
              res.cookie(cookieName('sfm_csrf'), newCsrf, {
                httpOnly: false,
                secure: isProdEnv(),
                sameSite: isProdEnv() ? 'strict' : 'lax',
                path: '/',
                maxAge: 30 * 24 * 60 * 60 * 1000, // Match access token expiration
              });
            }
            req.appAccountId = rj.accId;
            return next();
          }
        } catch {}
      }
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  }
}

module.exports.createCsrfGuard = function createCsrfGuard({ AUTH_ENABLED, PRIVATE_AUTH_ENABLED, pathIsAllowlisted, parseCookies, cookieName }) {
  return function csrfGuard(req, res, next) {
    if (!AUTH_ENABLED && !PRIVATE_AUTH_ENABLED) return next();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (pathIsAllowlisted(req.path)) return next();
    const cookies = parseCookies(req);
    const csrfCookie = cookies[cookieName('sfm_csrf')] || cookies['sfm_csrf'];
    const header = req.headers['x-csrf-token'];
    if (!csrfCookie || !header || String(header) !== String(csrfCookie)) {
      return res.status(403).json({ message: 'Invalid CSRF token' });
    }
    return next();
  }
}



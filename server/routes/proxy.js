const express = require('express');
const { logProxyRequest } = require('../utils/proxyLogger');
const streamProxyFactory = require('./streamProxy');

// In-memory cache for proxied responses (60s TTL)
const _proxyCache = new Map(); // key: cacheKey, value: { data, contentType, ts }
const CACHE_TTL_MS = 60 * 1000;

function getCachedProxy(key) {
  const rec = _proxyCache.get(key);
  if (!rec) return null;
  if (Date.now() - rec.ts > CACHE_TTL_MS) {
    _proxyCache.delete(key);
    return null;
  }
  return rec;
}

function setCachedProxy(key, data, contentType) {
  _proxyCache.set(key, { data, contentType, ts: Date.now() });
}

/**
 * Get the base URL from a manifest URL
 * e.g., https://addon.com/path/manifest.json -> https://addon.com/path
 */
function getBaseUrl(manifestUrl) {
  return manifestUrl.replace(/\/manifest\.json$/i, '');
}

/**
 * Rewrite all occurrences of the original addon URL to the proxy URL
 * This is critical for security - ensures original URL is never exposed
 */
function rewriteUrls(content, originalBaseUrl, proxyBaseUrl, uuid) {
  let text = typeof content === 'string' ? content : JSON.stringify(content);

  // Escape special regex characters in the URL
  const escaped = originalBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace https:// variant
  const httpsPattern = new RegExp(escaped.replace(/^https?:/, 'https:'), 'gi');
  text = text.replace(httpsPattern, `${proxyBaseUrl}/proxy/${uuid}`);

  // Replace http:// variant
  const httpPattern = new RegExp(escaped.replace(/^https?:/, 'http:'), 'gi');
  text = text.replace(httpPattern, `${proxyBaseUrl}/proxy/${uuid}`);

  // Replace protocol-relative variant (//domain.com/path)
  const noProtocol = originalBaseUrl.replace(/^https?:/, '');
  const noProtocolEscaped = noProtocol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const noProtocolPattern = new RegExp(noProtocolEscaped, 'gi');
  text = text.replace(noProtocolPattern, `${proxyBaseUrl.replace(/^https?:/, '')}/proxy/${uuid}`);

  return text;
}

/**
 * Set CORS headers for Stremio compatibility
 */
function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '86400');
}

/**
 * Get the real client IP address, checking proxy headers first
 */
function getClientIp(req) {
  // Check common proxy headers for the real client IP
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    // X-Forwarded-For can be a comma-separated list, take the first one
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0];
  }
  
  const realIp = req.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  const cfConnectingIp = req.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  
  // Fall back to req.ip if no proxy headers
  return req.ip;
}

module.exports = ({ prisma, decrypt, getAccountId, getServerKey }) => {
  const router = express.Router();
  const { processStreamResponse } = streamProxyFactory({ getServerKey });

  // CORS preflight for all proxy routes
  router.options('/:uuid/*', (req, res) => {
    setCorsHeaders(res);
    res.status(204).end();
  });

  router.options('/:uuid', (req, res) => {
    setCorsHeaders(res);
    res.status(204).end();
  });

  // GET /:uuid/manifest.json - serve manifest from database
  router.get('/:uuid/manifest.json', async (req, res) => {
    const startTime = Date.now();
    const { uuid } = req.params;
    let addon = null;
    let errorMessage = null;
    let requestUrl = null;

    // Set up logging to run when response is finished
    res.on('finish', () => {
      const responseTimeMs = Date.now() - startTime;
      if (addon) {
        logProxyRequest({
          addon,
          path: '/manifest.json',
          url: requestUrl,
          upstreamUrl: originalManifestUrl,
          method: req.method,
          ip: getClientIp(req),
          userAgent: req.get('user-agent'),
          statusCode: res.statusCode,
          cacheHit: false,
          responseTimeMs,
          error: errorMessage
        });
      }
    });

    try {
      setCorsHeaders(res);

      // Look up addon by proxyUuid
      addon = await prisma.addon.findFirst({
        where: {
          proxyUuid: uuid,
          proxyEnabled: true,
          isActive: true
        }
      });

      if (!addon) {
        errorMessage = 'Addon not found or proxy not enabled';
        return res.status(404).json({ error: errorMessage });
      }

      // Decrypt the manifest
      let manifestData;
      try {
        if (addon.manifest) {
          manifestData = JSON.parse(decrypt(addon.manifest, req));
        } else {
          errorMessage = 'Addon manifest not available';
          return res.status(404).json({ error: errorMessage });
        }
      } catch (e) {
        console.error('Error decrypting manifest:', e);
        errorMessage = 'Failed to decrypt manifest';
        return res.status(500).json({ error: errorMessage });
      }

      // Get the original manifest URL to determine base URL for rewriting
      let originalManifestUrl;
      try {
        originalManifestUrl = decrypt(addon.manifestUrl, req);
      } catch (e) {
        console.error('Error decrypting manifest URL:', e);
        errorMessage = 'Failed to resolve addon URL';
        return res.status(500).json({ error: errorMessage });
      }

      // Build the proxy URL that was actually accessed (NOT the upstream URL)
      requestUrl = `${req.protocol}://${req.get('host')}/proxy/${uuid}/manifest.json`;

      const originalBaseUrl = getBaseUrl(originalManifestUrl);
      const proxyBaseUrl = `${req.protocol}://${req.get('host')}`;

      // Rewrite all URLs in manifest to point to proxy
      const rewrittenManifest = rewriteUrls(manifestData, originalBaseUrl, proxyBaseUrl, uuid);

      res.set('Content-Type', 'application/json');
      res.send(rewrittenManifest);
    } catch (error) {
      console.error('Error serving proxy manifest:', error);
      errorMessage = error?.message || 'Internal server error';
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ALL /:uuid/* - proxy requests to upstream addon
  router.all('/:uuid/*', async (req, res) => {
    const startTime = Date.now();
    const { uuid } = req.params;
    const path = req.params[0]; // Everything after /:uuid/
    let addon = null;
    let cacheHit = false;
    let errorMessage = null;
    let requestUrl = null;
    let upstreamUrl = null;

    // Set up logging to run when response is finished
    res.on('finish', () => {
      const responseTimeMs = Date.now() - startTime;
      if (addon) {
        logProxyRequest({
          addon,
          path: `/${path}`,
          url: requestUrl,
          upstreamUrl: upstreamUrl,
          method: req.method,
          ip: getClientIp(req),
          userAgent: req.get('user-agent'),
          statusCode: res.statusCode,
          cacheHit,
          responseTimeMs,
          error: errorMessage
        });
      }
    });

    try {
      setCorsHeaders(res);

      // Look up addon by proxyUuid
      addon = await prisma.addon.findFirst({
        where: {
          proxyUuid: uuid,
          proxyEnabled: true,
          isActive: true
        }
      });

      if (!addon) {
        errorMessage = 'Addon not found or proxy not enabled';
        return res.status(404).json({ error: errorMessage });
      }

      // Get the original manifest URL to determine upstream base URL
      let originalManifestUrl;
      try {
        originalManifestUrl = decrypt(addon.manifestUrl, req);
      } catch (e) {
        console.error('Error decrypting manifest URL:', e);
        errorMessage = 'Failed to resolve addon URL';
        return res.status(500).json({ error: errorMessage });
      }

      const originalBaseUrl = getBaseUrl(originalManifestUrl);
      upstreamUrl = `${originalBaseUrl}/${path}`;
      // Build the proxy URL that was actually accessed (NOT the upstream URL)
      requestUrl = `${req.protocol}://${req.get('host')}/proxy/${uuid}/${path}`;
      const proxyBaseUrl = `${req.protocol}://${req.get('host')}`;

      // Check cache first
      const cacheKey = `${uuid}:${path}`;
      const cached = getCachedProxy(cacheKey);
      if (cached) {
        cacheHit = true;
        res.set('Content-Type', cached.contentType);
        res.set('X-Proxy-Cache', 'HIT');
        res.send(cached.data);
        return;
      }

      // Fetch from upstream
      let upstreamResponse;
      try {
        upstreamResponse = await fetch(upstreamUrl, {
          method: req.method,
          headers: {
            'User-Agent': 'Syncio-Proxy/1.0',
            'Accept': req.get('Accept') || '*/*'
          }
        });
      } catch (e) {
        console.error('Error fetching from upstream:', e);
        errorMessage = 'Failed to fetch from upstream addon';
        return res.status(502).json({ error: errorMessage });
      }

      if (!upstreamResponse.ok) {
        errorMessage = `Upstream returned ${upstreamResponse.status}`;
        return res.status(upstreamResponse.status).json({
          error: errorMessage
        });
      }

      const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
      let responseData;

      // Only rewrite URLs for JSON and text content types
      if (contentType.includes('json') || contentType.includes('text')) {
        const text = await upstreamResponse.text();
        let processedData = rewriteUrls(text, originalBaseUrl, proxyBaseUrl, uuid);
        
        // If this is a stream response, encrypt stream URLs to hide them from clients
        if (path.includes('/stream/') || path.startsWith('stream/')) {
          try {
            const serverKey = getServerKey ? getServerKey() : null;
            if (serverKey) {
              processedData = await processStreamResponse(processedData, serverKey, proxyBaseUrl);
            }
          } catch (streamErr) {
            console.error('Error encrypting stream URLs:', streamErr);
            // Continue with unencrypted data if encryption fails
          }
        }
        
        responseData = processedData;
      } else {
        // For binary content, pass through as-is
        responseData = Buffer.from(await upstreamResponse.arrayBuffer());
      }

      // Cache the response (only for GET requests)
      if (req.method === 'GET') {
        setCachedProxy(cacheKey, responseData, contentType);
      }

      res.set('Content-Type', contentType);
      res.set('X-Proxy-Cache', 'MISS');
      res.send(responseData);
    } catch (error) {
      console.error('Error proxying request:', error);
      errorMessage = error?.message || 'Internal server error';
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};

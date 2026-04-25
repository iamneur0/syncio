const express = require('express');
const crypto = require('crypto');
const { Readable } = require('stream');
const { logProxyRequest } = require('../utils/proxyLogger');

/**
 * Set CORS headers for Stremio/streaming compatibility
 */
function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Location');
  res.set('Access-Control-Max-Age', '86400');
}

/**
 * Encrypt a stream URL for use in the proxy
 * Uses AES-256-GCM with the server key
 */
function encryptStreamUrl(url, serverKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', serverKey, iv);
  const ciphertext = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // Format: iv:ciphertext:tag (all base64)
  const encrypted = `${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
  
  // URL-safe base64 encoding (replace + with -, / with _, remove =)
  return Buffer.from(encrypted).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decrypt a stream URL from the proxy format
 */
function decryptStreamUrl(encryptedPayload, serverKey) {
  try {
    // Restore URL-safe base64 to standard base64
    let base64 = encryptedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    const encrypted = Buffer.from(base64, 'base64').toString('utf8');
    const parts = encrypted.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted stream URL format');
    }
    
    const [ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', serverKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    
    return plaintext.toString('utf8');
  } catch (error) {
    throw new Error(`Failed to decrypt stream URL: ${error.message}`);
  }
}

/**
 * Resolve the final URL after following redirects, without downloading the body.
 */
async function getRedirectedUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Syncio/1.0)",
      },
    });
    const finalUrl = response.url;
    // Don't download body: cancel the stream
    if (response.body) {
      await response.body.cancel();
    }
    return finalUrl;
  } catch (error) {
    console.warn(`[StreamProxy] Failed to resolve redirect for ${url}: ${error.message}`);
    return url; // Fallback to original URL on error
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Process a stream response to encrypt stream URLs
 * This transforms the streams array to use encrypted proxy URLs
 */
async function processStreamResponse(data, serverKey, proxyBaseUrl) {
  try {
    const json = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Only process if this looks like a stream response
    if (!json || typeof json !== 'object') {
      return data;
    }
    
    // Handle streams array
    if (Array.isArray(json.streams)) {
      // Process streams in parallel
      json.streams = await Promise.all(json.streams.map(async (stream) => {
        if (!stream || typeof stream !== 'object') {
          return stream;
        }
        
        // Encrypt the URL field if present
        if (stream.url && typeof stream.url === 'string') {
          try {
            console.log(`[StreamProxy] Resolving redirect for URL: ${stream.url.substring(0, 100)}...`);
            // Resolve the final URL (follow redirects)
            const resolvedUrl = await getRedirectedUrl(stream.url);
            console.log(`[StreamProxy] Resolved to: ${resolvedUrl.substring(0, 100)}...`);

            const encryptedUrl = encryptStreamUrl(resolvedUrl, serverKey);
            stream.url = `${proxyBaseUrl}/stream/${encryptedUrl}`;
          } catch (e) {
            console.error('[StreamProxy] Failed to process stream URL:', e.message);
            // Keep original URL if encryption/resolution fails
          }
        }
        
        // Encrypt externalUrl if present (some addons use this)
        // We probably should resolve this too if it's treated as a stream source, 
        // but instructions focused on "stream links". adhering to pattern for safety.
        if (stream.externalUrl && typeof stream.externalUrl === 'string') {
          try {
            const resolvedExternalUrl = await getRedirectedUrl(stream.externalUrl);
            const encryptedUrl = encryptStreamUrl(resolvedExternalUrl, serverKey);
            stream.externalUrl = `${proxyBaseUrl}/stream/${encryptedUrl}`;
          } catch (e) {
            console.error('Failed to encrypt externalUrl:', e.message);
            // Keep original URL if encryption fails
          }
        }
        
        return stream;
      }));
    }
    
    return JSON.stringify(json);
  } catch (error) {
    // If parsing fails, return original data
    console.warn('Failed to process stream response:', error.message);
    return data;
  }
}

/**
 * Get the real client IP address
 */
function getClientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.get('x-real-ip') || req.get('cf-connecting-ip') || req.ip;
}

module.exports = ({ getServerKey }) => {
  const router = express.Router();
  const serverKey = getServerKey();

  // CORS preflight
  router.options('/:encryptedUrl(*)', (req, res) => {
    setCorsHeaders(res);
    res.status(204).end();
  });

  // GET /:encryptedUrl - decrypt and redirect to actual stream
  router.get('/:encryptedUrl(*)', async (req, res) => {
    const startTime = Date.now();
    const encryptedUrl = req.params.encryptedUrl;
    let targetUrl = null;
    let resolvedUrl = null;
    let errorMessage = null;
    
    // Helper to log request on finish
    const logRequest = () => {
      const responseTimeMs = Date.now() - startTime;
      logProxyRequest({
        addon: { name: 'Stream Proxy' }, // Generic name as we don't know the specific addon here
        path: '/stream',
        url: `${req.protocol}://${req.get('host')}/stream/${encryptedUrl}`,
        upstreamUrl: resolvedUrl || targetUrl,
        method: req.method,
        ip: getClientIp(req),
        userAgent: req.get('user-agent'),
        statusCode: res.statusCode,
        cacheHit: false,
        responseTimeMs,
        error: errorMessage
      });
    };

    res.on('finish', logRequest);

    console.log(`[StreamProxy] Received request for encrypted URL: ${encryptedUrl.substring(0, 50)}...`);
    
    try {
      setCorsHeaders(res);

      // Decrypt the target URL
      try {
        targetUrl = decryptStreamUrl(encryptedUrl, serverKey);
        console.log(`[StreamProxy] Decrypted URL: ${targetUrl.substring(0, 100)}...`);
      } catch (e) {
        errorMessage = 'Invalid or expired stream URL';
        console.error('[StreamProxy] Error decrypting stream URL:', e.message);
        return res.status(400).json({ error: errorMessage });
      }

      // Proxy the request to the target URL
      console.log(`[StreamProxy] Proxying content from: ${targetUrl.substring(0, 100)}...`);

      const fetchHeaders = {
        'User-Agent': req.get('User-Agent') || 'Syncio-Proxy/1.0',
        'Accept': req.get('Accept') || '*/*',
      };

      // Forward Range header if present (critical for seeking)
      if (req.headers.range) {
        fetchHeaders['Range'] = req.headers.range;
      }

      try {
        const upstreamResponse = await fetch(targetUrl, {
          method: 'GET',
          headers: fetchHeaders,
          redirect: 'follow'
        });

        // Capture the final URL (after redirects)
        resolvedUrl = upstreamResponse.url;
        if (resolvedUrl !== targetUrl) {
           console.log(`[StreamProxy] Redirected to: ${resolvedUrl.substring(0, 100)}...`);
        }

        // Forward status code
        res.status(upstreamResponse.status);

        // Forward relevant headers
        const headersToForward = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
          'cache-control',
          'last-modified',
          'etag',
          'content-disposition'
        ];

        let hasContentDisposition = false;
        headersToForward.forEach(header => {
          const value = upstreamResponse.headers.get(header);
          if (value) {
            res.set(header, value);
            if (header === 'content-disposition') hasContentDisposition = true;
          }
        });

        // If upstream didn't send a filename, try to derive one from the URL
        if (!hasContentDisposition) {
          try {
            const urlObj = new URL(resolvedUrl || targetUrl);
            const pathname = urlObj.pathname;
            const filename = pathname.split('/').pop();
            
            if (filename && filename.includes('.')) {
              // Simple cleanup to ensure it's a valid filename
              const cleanFilename = decodeURIComponent(filename).replace(/["\\]/g, '');
              res.set('Content-Disposition', `inline; filename="${cleanFilename}"`);
            }
          } catch (e) {
            // Ignore errors in filename generation
          }
        }

        // Pipe the response body
        if (upstreamResponse.body) {
          Readable.fromWeb(upstreamResponse.body).pipe(res);
        } else {
          res.end();
        }

      } catch (fetchError) {
        console.error('[StreamProxy] Error fetching upstream:', fetchError);
        errorMessage = 'Error fetching upstream content';
        if (!res.headersSent) {
           res.status(502).json({ error: errorMessage });
        }
      }
      
    } catch (error) {
      console.error('[StreamProxy] Error in stream proxy:', error);
      errorMessage = 'Internal server error';
      if (!res.headersSent) {
        res.status(500).json({ error: errorMessage });
      }
    }
  });

  return {
    router,
    encryptStreamUrl,
    decryptStreamUrl,
    processStreamResponse
  };
};

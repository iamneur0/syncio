/** @type {import('next').NextConfig} */
// Resolve app version (prefer manifest, then server/version.js, then package.json)
let APP_VERSION = 'dev'
try {
  const fs = require('fs')
  const path = require('path')
  // 1) Prefer .release-please-manifest.json (manifest mode)
  try {
    const manifestPath = path.join(__dirname, '..', '.release-please-manifest.json')
    if (fs.existsSync(manifestPath)) {
      const manifestRaw = fs.readFileSync(manifestPath, 'utf8')
      const manifestJson = JSON.parse(manifestRaw)
      if (manifestJson && typeof manifestJson['.'] === 'string' && manifestJson['.']) {
        APP_VERSION = manifestJson['.']
      }
    }
  } catch {}
  // 2) Fallback to server/version.js (managed by release-please extra-files)
  if (APP_VERSION === 'dev') {
    try {
      const serverRaw = fs.readFileSync(path.join(__dirname, '..', 'server', 'version.js'), 'utf8')
      const m = serverRaw.match(/VERSION\s*=\s*'([^']+)'/)
      if (m && m[1]) APP_VERSION = m[1]
    } catch {}
  }
  // 3) Fallback to root package.json
  if (APP_VERSION === 'dev') {
    try {
      const pkgRaw = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
      const pkg = JSON.parse(pkgRaw)
      APP_VERSION = pkg.version || 'dev'
    } catch {}
  }
} catch {}

const nextConfig = {
  reactStrictMode: true,
  
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },

  // Image optimization
  images: {
    // Note: images.domains is deprecated, use remotePatterns instead
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
  },

  // Experimental features
  experimental: {
    // optimizeCss: true, // Disabled due to critters module issue in Docker
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ]
  },

  // Rewrites for API proxy in development
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
    console.log('API URL for rewrites:', apiUrl)
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:4000/api/:path*`,
      },
      // Proxy invite API endpoints (not the page route)
      {
        source: '/invite/:inviteCode/check',
        destination: `http://localhost:4000/invite/:inviteCode/check`,
      },
      {
        source: '/invite/:inviteCode/request',
        destination: `http://localhost:4000/invite/:inviteCode/request`,
      },
      {
        source: '/invite/:inviteCode/status',
        destination: `http://localhost:4000/invite/:inviteCode/status`,
      },
      {
        source: '/invite/:inviteCode/generate-oauth',
        destination: `http://localhost:4000/invite/:inviteCode/generate-oauth`,
      },
      {
        source: '/invite/:inviteCode/complete',
        destination: `http://localhost:4000/invite/:inviteCode/complete`,
      },
      // Proxy delete/opt-out endpoints (no invite code)
      {
        source: '/invite/generate-oauth',
        destination: `http://localhost:4000/invite/generate-oauth`,
      },
      {
        source: '/invite/delete-user',
        destination: `http://localhost:4000/invite/delete-user`,
      },
    ]
  },

  // Output configuration for Docker
  output: 'standalone',
}

module.exports = nextConfig

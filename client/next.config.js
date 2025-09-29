/** @type {import('next').NextConfig} */
// Read app version from root package.json (Syncio version)
let APP_VERSION = 'dev'
try {
  // parent of client/
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  APP_VERSION = require('fs').readFileSync(require('path').join(__dirname, '..', 'package.json'), 'utf8')
  APP_VERSION = JSON.parse(APP_VERSION).version || 'dev'
} catch {}

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:4000/api',
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },

  // Image optimization
  images: {
    domains: ['localhost'],
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
    console.log('API URL for rewrites: http://localhost:4000/api')
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:4000/api/:path*`,
      },
    ]
  },

  // Output configuration for Docker
  output: 'standalone',
}

module.exports = nextConfig

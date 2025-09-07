/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:4000/api',
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

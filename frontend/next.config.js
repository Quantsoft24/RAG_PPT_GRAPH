/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // Required for Docker deployment

  async rewrites() {
    // In Docker: backend runs on same network as 'backend' service
    // Locally: falls back to localhost:8000
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${apiUrl}/health`,
      },
      {
        source: '/presenton/:path*',
        destination: 'http://34.47.137.44:5000/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow API calls to FastAPI backend + Presenton proxy
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/health',
        destination: 'http://localhost:8000/health',
      },
      {
        source: '/presenton/:path*',
        destination: 'http://34.47.137.44:5000/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

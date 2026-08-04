import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@project-api/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'yt3.googleusercontent.com' },
      { protocol: 'https', hostname: 'yt3.ggpht.com' },
      { protocol: 'https', hostname: 'scontent.cdninstagram.com' },
      { protocol: 'https', hostname: 'instagram.fbcdn.net' },
    ],
  },
}

export default nextConfig

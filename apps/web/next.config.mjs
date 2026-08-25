import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for Docker (.next/standalone/server.js).
  output: 'standalone',
  // The API sets these on its own responses; the pages are served by Next, so
  // they need saying here too. Deliberately no Content-Security-Policy yet:
  // one strict enough to be worth having would have to be checked page by page
  // against the app's inline styles and the video/board embeds first.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nothing here is meant to be embedded elsewhere, and framing it is
          // how a click on a foreign page becomes a click in this app.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            // The lesson room asks for the mic and camera; nothing asks for
            // location.
            value: 'geolocation=(), microphone=(self), camera=(self)'
          }
        ]
      }
    ];
  }
};

export default withNextIntl(nextConfig);

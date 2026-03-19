/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.DJANGO_API_URL
    ? {
        async rewrites() {
          const djangoUrl = process.env.DJANGO_API_URL;
          return [
            // ── Batch 1: Simple CRUD ──────────────────────────────────────
            { source: '/api/roles/:path*', destination: `${djangoUrl}/api/roles/:path*` },
            { source: '/api/roles', destination: `${djangoUrl}/api/roles` },
            { source: '/api/email-templates/:path*', destination: `${djangoUrl}/api/email-templates/:path*` },
            { source: '/api/email-templates', destination: `${djangoUrl}/api/email-templates` },
            { source: '/api/pipeline-stages', destination: `${djangoUrl}/api/pipeline-stages` },
            { source: '/api/org-settings/test', destination: `${djangoUrl}/api/org-settings/test` },
            { source: '/api/org-settings', destination: `${djangoUrl}/api/org-settings` },
            { source: '/api/leads', destination: `${djangoUrl}/api/leads` },
            { source: '/api/scorecards/:path*', destination: `${djangoUrl}/api/scorecards/:path*` },
            { source: '/api/scorecards', destination: `${djangoUrl}/api/scorecards` },
          ];
        },
      }
    : {}),
};

export default nextConfig;

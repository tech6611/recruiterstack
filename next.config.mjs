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
            // ── Batch 2: Public routes + Email ────────────────────────────
            { source: '/api/apply/upload', destination: `${djangoUrl}/api/apply/upload` },
            { source: '/api/apply', destination: `${djangoUrl}/api/apply` },
            { source: '/api/intake/preview-jd', destination: `${djangoUrl}/api/intake/preview-jd` },
            { source: '/api/intake/:token/approve', destination: `${djangoUrl}/api/intake/:token/approve` },
            { source: '/api/intake/:token/generate-jd', destination: `${djangoUrl}/api/intake/:token/generate-jd` },
            { source: '/api/intake/:token', destination: `${djangoUrl}/api/intake/:token` },
            { source: '/api/parse-document', destination: `${djangoUrl}/api/parse-document` },
            { source: '/api/resume/parse', destination: `${djangoUrl}/api/resume/parse` },
            { source: '/api/email/draft', destination: `${djangoUrl}/api/email/draft` },
            { source: '/api/email/send', destination: `${djangoUrl}/api/email/send` },
          ];
        },
      }
    : {}),
};

export default nextConfig;

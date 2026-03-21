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
            // ── Batch 3: Candidates ───────────────────────────────────────
            { source: '/api/candidates', destination: `${djangoUrl}/api/candidates` },
            { source: '/api/candidates/:id', destination: `${djangoUrl}/api/candidates/:id` },
            { source: '/api/candidates/:id/tags', destination: `${djangoUrl}/api/candidates/:id/tags` },
            { source: '/api/candidates/:id/tags/:tagId', destination: `${djangoUrl}/api/candidates/:id/tags/:tagId` },
            { source: '/api/candidates/:id/tasks', destination: `${djangoUrl}/api/candidates/:id/tasks` },
            { source: '/api/candidates/:id/tasks/:taskId', destination: `${djangoUrl}/api/candidates/:id/tasks/:taskId` },
            { source: '/api/candidates/:id/referrals', destination: `${djangoUrl}/api/candidates/:id/referrals` },
            { source: '/api/candidates/:id/ai-summary', destination: `${djangoUrl}/api/candidates/:id/ai-summary` },
            // ── Batch 3: Applications ─────────────────────────────────────
            { source: '/api/applications', destination: `${djangoUrl}/api/applications` },
            { source: '/api/applications/:id', destination: `${djangoUrl}/api/applications/:id` },
            // ── Batch 3: Matches ──────────────────────────────────────────
            { source: '/api/matches', destination: `${djangoUrl}/api/matches` },
            // ── Batch 4: Hiring Requests ──────────────────────────────────
            { source: '/api/hiring-requests', destination: `${djangoUrl}/api/hiring-requests` },
            { source: '/api/hiring-requests/:id', destination: `${djangoUrl}/api/hiring-requests/:id` },
            // ── Batch 4: Jobs ─────────────────────────────────────────────
            { source: '/api/jobs', destination: `${djangoUrl}/api/jobs` },
            { source: '/api/jobs/:id/stages', destination: `${djangoUrl}/api/jobs/:id/stages` },
            { source: '/api/jobs/:id', destination: `${djangoUrl}/api/jobs/:id` },
            // ── Batch 4: Application Email + Draft ────────────────────────
            { source: '/api/applications/:id/send-email', destination: `${djangoUrl}/api/applications/:id/send-email` },
            { source: '/api/applications/:id/draft', destination: `${djangoUrl}/api/applications/:id/draft` },
            // ── Batch 5: Google OAuth ─────────────────────────────────────
            { source: '/api/google/connect',      destination: `${djangoUrl}/api/google/connect` },
            { source: '/api/google/callback',     destination: `${djangoUrl}/api/google/callback` },
            { source: '/api/google/disconnect',   destination: `${djangoUrl}/api/google/disconnect` },
            { source: '/api/google/availability', destination: `${djangoUrl}/api/google/availability` },
            // ── Batch 5: Slack OAuth ──────────────────────────────────────
            { source: '/api/slack/install',    destination: `${djangoUrl}/api/slack/install` },
            { source: '/api/slack/callback',   destination: `${djangoUrl}/api/slack/callback` },
            { source: '/api/slack/disconnect', destination: `${djangoUrl}/api/slack/disconnect` },
            // ── Batch 5: Interviews + Offers + Inbox ──────────────────────
            { source: '/api/interviews',           destination: `${djangoUrl}/api/interviews` },
            { source: '/api/interviews/:id',       destination: `${djangoUrl}/api/interviews/:id` },
            { source: '/api/offers',               destination: `${djangoUrl}/api/offers` },
            { source: '/api/offers/:id',           destination: `${djangoUrl}/api/offers/:id` },
            { source: '/api/inbox',                destination: `${djangoUrl}/api/inbox` },
            // ── Batch 5: Application AI email-draft ───────────────────────
            { source: '/api/applications/:id/email-draft', destination: `${djangoUrl}/api/applications/:id/email-draft` },
            // ── Batch 6: Analytics + Dashboard ────────────────────────────
            { source: '/api/analytics',            destination: `${djangoUrl}/api/analytics` },
            { source: '/api/dashboard',            destination: `${djangoUrl}/api/dashboard` },
          ];
        },
      }
    : {}),
};

export default nextConfig;

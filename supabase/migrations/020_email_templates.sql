-- ── Email Templates ────────────────────────────────────────────────────────────
-- Org-scoped saved email templates with CRM-style placeholders.
-- Placeholders use {{double_curly}} syntax, e.g. {{first_name}}, {{position_title}}.

create table if not exists email_templates (
  id           uuid        primary key default gen_random_uuid(),
  org_id       text        not null,
  name         text        not null,     -- display name shown in dropdown
  subject      text        not null,     -- subject line (may contain {{placeholders}})
  body         text        not null,     -- HTML body (may contain {{placeholders}})
  created_by   text,                     -- clerk userId
  created_at   timestamptz not null default now()
);

create index if not exists email_templates_org_idx on email_templates(org_id);

-- Service-role key is used server-side; RLS enabled but app bypasses via service key
alter table email_templates enable row level security;

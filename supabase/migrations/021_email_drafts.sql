-- 021_email_drafts: auto-saved email compose drafts (one per application per org)

create table if not exists email_drafts (
  id             uuid        primary key default gen_random_uuid(),
  org_id         text        not null,
  application_id text        not null,
  to_emails      text[]      not null default '{}',
  cc_emails      text[]      not null default '{}',
  bcc_emails     text[]      not null default '{}',
  subject        text        not null default '',
  body           text        not null default '',
  created_by     text,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- One draft per application per org
create unique index if not exists email_drafts_app_org_idx
  on email_drafts(application_id, org_id);

alter table email_drafts enable row level security;

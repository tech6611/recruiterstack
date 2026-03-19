-- 022_email_drafts_multi: allow multiple drafts per application (Gmail-style)
-- Drops the one-draft-per-app unique constraint and adds a name column

drop index if exists email_drafts_app_org_idx;

alter table email_drafts
  add column if not exists name text not null default '';

-- Migration 014: Add 'closed' to hiring_request_status enum
-- Allows jobs to be archived/closed without deletion.

ALTER TYPE hiring_request_status ADD VALUE IF NOT EXISTS 'closed';

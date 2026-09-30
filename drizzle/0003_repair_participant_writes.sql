-- Preserve existing participant rows while replacing the failing D1-level
-- relationship check with validation in the participant API.
DROP INDEX IF EXISTS idx_company_participants_company;
ALTER TABLE company_participants RENAME TO company_participants_foreign_key_legacy;
CREATE TABLE company_participants (
  id TEXT PRIMARY KEY,
  training_company_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  ic_number TEXT NOT NULL,
  application_status TEXT NOT NULL DEFAULT 'pending_application',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(training_company_id, ic_number)
);
INSERT OR IGNORE INTO company_participants SELECT * FROM company_participants_legacy;
INSERT OR IGNORE INTO company_participants SELECT * FROM company_participants_foreign_key_legacy;
CREATE INDEX idx_company_participants_company ON company_participants(training_company_id);

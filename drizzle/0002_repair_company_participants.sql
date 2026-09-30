-- Rebuild the participant table while preserving the prior table for audit.
-- The original foreign-key link stopped accepting new participant records.
DROP INDEX IF EXISTS idx_company_participants_company;
ALTER TABLE company_participants RENAME TO company_participants_legacy;
CREATE TABLE company_participants (
  id TEXT PRIMARY KEY,
  training_company_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  ic_number TEXT NOT NULL,
  application_status TEXT NOT NULL DEFAULT 'pending_application',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(training_company_id, ic_number),
  FOREIGN KEY(training_company_id) REFERENCES training_companies(id) ON DELETE CASCADE
);
CREATE INDEX idx_company_participants_company ON company_participants(training_company_id);

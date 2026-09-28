-- Run this once only for an already-created local database.
ALTER TYPE grant_status RENAME TO grant_status_old;
CREATE TYPE grant_status AS ENUM ('follow_up', 'applied', 'approved', 'rejected');
ALTER TABLE training_companies
  ALTER COLUMN grant_status DROP DEFAULT,
  ALTER COLUMN grant_status TYPE grant_status
    USING (CASE grant_status::text WHEN 'pending' THEN 'follow_up' ELSE grant_status::text END)::grant_status,
  ALTER COLUMN grant_status SET DEFAULT 'follow_up';
DROP TYPE grant_status_old;

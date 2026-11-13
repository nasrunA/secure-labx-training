CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE training_status AS ENUM ('planned', 'in_review', 'approved', 'completed', 'cancelled');
CREATE TYPE participant_status AS ENUM ('active', 'inactive');

CREATE TABLE reporting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_year SMALLINT NOT NULL CHECK (reporting_year BETWEEN 2020 AND 2100),
  reporting_month SMALLINT NOT NULL CHECK (reporting_month BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporting_year, reporting_month)
);

CREATE TABLE dashboard_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_year SMALLINT NOT NULL UNIQUE CHECK (reporting_year BETWEEN 2020 AND 2100),
  total_training_revenue NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_training_revenue >= 0),
  total_rebate_credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_rebate_credit >= 0),
  hrdc_paid_to_slx NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (hrdc_paid_to_slx >= 0),
  net_training_contribution NUMERIC(14,2) NOT NULL DEFAULT 0,
  rebate_credit_used NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rebate_credit_used >= 0),
  unutilised_rebate_credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unutilised_rebate_credit >= 0),
  rebate_utilisation_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (rebate_utilisation_percent BETWEEN 0 AND 100),
  number_of_trainings INTEGER NOT NULL DEFAULT 0 CHECK (number_of_trainings >= 0),
  total_participants INTEGER NOT NULL DEFAULT 0 CHECK (total_participants >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE training_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  start_date DATE,
  end_date DATE,
  location VARCHAR(120),
  status training_status NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TYPE grant_status AS ENUM ('follow_up', 'applied', 'approved', 'rejected');

CREATE TABLE training_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  company_name VARCHAR(180) NOT NULL,
  participant_count INTEGER NOT NULL CHECK (participant_count >= 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 1799.00 CHECK (unit_price >= 0),
  gross_hrdc_claim NUMERIC(14,2) NOT NULL CHECK (gross_hrdc_claim >= 0),
  grant_status grant_status NOT NULL DEFAULT 'follow_up',
  rebate_status VARCHAR(16) NOT NULL DEFAULT 'unused' CHECK (rebate_status IN ('fully_used', 'unused')),
  rebate_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(40) UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) UNIQUE,
  status participant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE training_participants (
  training_program_id UUID NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  attended_at TIMESTAMPTZ,
  PRIMARY KEY (training_program_id, participant_id)
);

CREATE TYPE application_status AS ENUM ('registered', 'pending_application');

CREATE TABLE company_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_company_id UUID NOT NULL REFERENCES training_companies(id) ON DELETE CASCADE,
  full_name VARCHAR(160) NOT NULL,
  ic_number VARCHAR(30) NOT NULL,
  phone_number VARCHAR(16),
  application_status application_status NOT NULL DEFAULT 'pending_application',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_company_id, ic_number)
);

CREATE TABLE monthly_training_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_period_id UUID NOT NULL UNIQUE REFERENCES reporting_periods(id) ON DELETE CASCADE,
  training_revenue NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (training_revenue >= 0),
  rebate_issued NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (rebate_issued >= 0),
  credit_used NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_used >= 0),
  remaining_credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (remaining_credit >= 0),
  number_of_trainings INTEGER NOT NULL DEFAULT 0 CHECK (number_of_trainings >= 0),
  net_contribution NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE credit_usage_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE credit_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES credit_usage_categories(id) ON DELETE RESTRICT,
  amount_used NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_used >= 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporting_period_id, category_id)
);

CREATE INDEX idx_training_programs_status ON training_programs(status);
CREATE INDEX idx_training_companies_program ON training_companies(training_program_id);
CREATE INDEX idx_company_participants_company ON company_participants(training_company_id);
CREATE INDEX idx_credit_usage_records_period ON credit_usage_records(reporting_period_id);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('applicant', 'trainer', 'sales', 'superadmin')),
  password_salt CHAR(32) NOT NULL,
  password_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_one_superadmin ON users(role) WHERE role = 'superadmin';

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

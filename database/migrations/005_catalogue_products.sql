CREATE TABLE catalogue_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_data BYTEA NOT NULL,
  file_name TEXT NOT NULL,
  file_type VARCHAR(200) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalogue_products_position ON catalogue_products(position, created_at);

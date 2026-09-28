# Secure LabX PostgreSQL database

The dashboard database is provisioned with PostgreSQL 16 and initialized from `schema.sql` and `seed.sql`.

1. Copy `.env.example` to `.env` and set a strong local `POSTGRES_PASSWORD`.
2. Run `docker compose up -d` from the project root.
3. Connect at `postgresql://secure_labx_app:<your-password>@localhost:5432/secure_labx`.

The current schema stores entered values only. Dashboard calculations, aggregates, and reporting views will be added later when you provide the calculation rules.

The initialization SQL is executed only when the Docker volume is created. To intentionally reset a local development database, run `docker compose down -v` and then `docker compose up -d`.

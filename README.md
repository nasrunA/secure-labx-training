# Secure LabX

Secure LabX is a web application for training administration. It brings training sessions, company and participant records, grant and rebate tracking, credit management, reports, and product advertisements into one role-based workspace.

## Features

- Manage training sessions, companies, participants, and application statuses.
- Track grant and rebate information, credits, and training reports.
- Manage trainer, sales team, and applicant accounts with role-based access.
- Publish product advertisements and documents in a shared catalogue.
- Run locally with PostgreSQL or deploy with Cloudflare Workers, D1, and R2.

## Technology

- React 18 and Vite
- Node.js and LoopBack REST API for local development
- PostgreSQL 16 for the local database
- Cloudflare Workers, D1, and R2 for the hosted application

## Run locally

### Requirements

- Node.js and npm
- Docker Desktop (for the local PostgreSQL database)

### Setup

1. Clone the repository and open a terminal in its directory.
2. Create a root `.env` from the example and set a strong local database password:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Install the frontend and backend dependencies:

   ```powershell
   npm install
   npm --prefix backend install
   ```

4. Set `DATABASE_URL` in `backend/.env` to use the same password as the root `.env`. Start PostgreSQL:

   ```powershell
   docker compose up -d
   ```

5. Start the API and frontend together:

   ```powershell
   npm run local
   ```

6. Open [http://localhost:3000](http://localhost:3000). The local API runs at [http://localhost:3001](http://localhost:3001); its REST Explorer is at [http://localhost:3001/explorer](http://localhost:3001/explorer).

Create a local superadmin in a separate interactive terminal. Replace the example email with the account email you want to use; the command prompts securely for a password of at least 12 characters:

```powershell
npm --prefix backend run auth:bootstrap -- --email admin@example.com
```

For an existing local database, apply the catalogue migration as described in [backend/README.md](backend/README.md).

## Build

```powershell
npm run build
npm --prefix backend run build
```

## Deployment

The hosted application uses Cloudflare Workers for the frontend/API, D1 for relational data, and R2 for uploaded files. Cloudflare deployment requires access to the configured account and resources. Apply D1 migrations with:

```powershell
npm run cf:db:init
```

Create the first hosted superadmin with an interactive password prompt:

```powershell
npm run auth:bootstrap -- --email admin@example.com --remote
```

Deploy the Worker with:

```powershell
npm run deploy
```

## Project notes

- Local `.env` files contain machine-specific settings and are ignored by Git. Never commit database passwords, API keys, or other secrets.
- Local PostgreSQL data and hosted Cloudflare D1 data are separate environments.
- See [backend/README.md](backend/README.md) for API and migration details, and [database/README.md](database/README.md) for PostgreSQL setup.

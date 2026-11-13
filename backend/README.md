# Secure LabX LoopBack API

This Node.js + LoopBack REST API connects to the local PostgreSQL database created in the project root.

1. Copy `backend/.env.example` to `backend/.env` and set the matching database password.
2. Run `npm install` inside `backend/`.
3. Run `npm run dev` inside `backend/`.

The API runs at `http://localhost:3001`.

Open `http://localhost:3001/explorer` to view and test the local API in the
LoopBack REST Explorer. The explorer is local-only and does not change the
website routes or the hosted backend.

The local website proxies `/api` requests to this API on port 3001, so local
development uses PostgreSQL. The deployed website is independent and continues
to use the Cloudflare Worker and D1 database.

For an existing PostgreSQL volume, apply the additive account and participant
phone migrations from the repository root:

```powershell
Get-Content -Raw database/migrations/003_auth_accounts.sql | docker exec -i secure-labx-postgres psql -U secure_labx_app -d secure_labx
Get-Content -Raw database/migrations/004_participant_phone_number.sql | docker exec -i secure-labx-postgres psql -U secure_labx_app -d secure_labx
```

Then start both the API and frontend from the repository root with:

```powershell
npm run local
```

Create the initial local superadmin with `npm --prefix backend run auth:bootstrap -- --email admin@example.com`. The command prompts for a password without displaying it.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/training-sessions` | List sessions; supports `?search=` |
| `POST /api/training-sessions` | Create a session |
| `PATCH /api/training-sessions/:id` | Edit a session |
| `GET /api/training-sessions/:id/companies` | List companies in a session |
| `POST /api/training-sessions/:id/companies` | Add company; total is calculated as `1799 × participantCount` |
| `PATCH /api/training-companies/:id` | Edit company details, participant count, or grant status |
| `DELETE /api/training-companies/:id` | Delete a company record |

Grant status values are `follow_up`, `applied`, `approved`, and `rejected`.

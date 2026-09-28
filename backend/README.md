# Secure LabX LoopBack API

This Node.js + LoopBack REST API connects to the local PostgreSQL database created in the project root.

1. Copy `backend/.env.example` to `backend/.env` and set the matching database password.
2. Run `npm install` inside `backend/`.
3. Run `npm run dev` inside `backend/`.

The API runs at `http://localhost:3001`.

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

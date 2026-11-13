# Secure LabX interface refresh

Design reference: [CoreUI Free React Admin](https://coreui.io/demos/react/5.0/free/#/dashboard), using the project's existing CoreUI React components. This is a tailored adaptation of its administration layout, not a copy of its demo data or paid template assets.

The active entry point is `src/main.jsx` and the new interface is in `src/workspace/`. The previous components and styles are retained on disk, but the old global DOM-mutating scripts are no longer imported.

## Preserved workflows

- Schedule/edit sessions; date-only values stay on the same calendar day.
- Expand sessions, add/edit companies, and remove companies from the edit dialog after confirmation.
- Participant count starts blank, accepts zero, and uses the existing RM 1,799 unit price.
- All four grant statuses remain available.
- Company-name links open participants for the exact company ID, including when names are identical across sessions.
- Add/edit/remove participants; automatic IC formatting and Registered/Pending application statuses.
- Participant deletion remains in its edit form, behind the square teal action icon.
- Search and date/sequence/company-count sorting operate on React state.
- Desktop sidebar collapse and mobile navigation drawer.

## Repaired controls

- Dashboard report button opens a branded monthly report with all recorded columns, CSV download, and print/save PDF.
- The profile dropdown replaces the topbar export/sign-out controls; report and register exports remain available from their relevant pages.
- Credit management reads recorded credit usage from PostgreSQL.
- Participants navigation opens a searchable register across companies.
- Reports, help, and display settings have working destinations.
- Backend duplicate IC failures return a readable HTTP 409 for create and update.
- Development server uses strict port 3000 to avoid accidentally occupying API port 3001.

## Data boundaries

The new reporting endpoint reads existing annual summary, monthly performance, and credit usage tables. No business records or calculation rules were migrated or overwritten. Annual reporting values are distinct from live registration counts and are labelled accordingly. Adding a participant does not silently change the manually allocated company participant count.

## Login and account administration

The public sign-in screen has Applicant, Trainer and Sales Team role tabs. Superadmin sign-in is only linked from the Trainer tab and opens a separate workspace with two account sections: Trainer & Sales Team, and Applicants. Superadmins can create, edit, reset passwords and delete accounts in the matching section. Signed-in users can update their own email and password from the profile dropdown after confirming their current password; roles and account deletion remain Superadmin-managed. Passwords are stored as PBKDF2 hashes and sessions use an HttpOnly cookie.

Apply the D1 migrations with `npm run cf:db:init`, then create the first superadmin interactively with `npm run auth:bootstrap -- --email admin@example.com --remote`. Omit `--remote` to initialize the local Wrangler database. The bootstrap command asks for the password without echoing it and does not accept a default password.

For local development, run `npm run local` to start the frontend and PostgreSQL-backed LoopBack API together. Alternatively, run `npm --prefix backend run dev` and `npm start` in separate terminals. Vite proxies `/api` to `http://127.0.0.1:3001`. Create the local Superadmin with `npm --prefix backend run auth:bootstrap -- --email admin@example.com`. The deployed website still uses the Cloudflare Worker and D1; local proxy settings do not affect production.

## Verification

Run `npm test` for interface and Worker checks using React Testing Library and a simulated DOM/API. These exercise navigation, login role selection, API authorization, password hashing/session issuance, search/sort, editors, cancellation, validation, exports, print invocation, failure recovery and mobile navigation behaviour. They do not substitute for visual browser layout inspection or printed-page inspection.

Run `npm run build` and `npm --prefix backend run build` for production compilation.

From `backend`, `node scripts/check-workflows.mjs` exercises the local API/database with uniquely labelled disposable session/company/participant records. Its cleanup removes only the generated session ID with its matching generated reference. Existing business records are not touched. Live checks cover session create/update, same-day dates, company CRUD and totals, grant statuses, participant CRUD and duplicate IC responses.

Browser visual verification was blocked by the computer-use tool because it could not verify the current Chrome URL. Desktop/mobile appearance and print pagination still need a direct visual review.

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
- Topbar export provides the training register, or opens reporting as appropriate.
- Credit management reads recorded credit usage from PostgreSQL.
- Participants navigation opens a searchable register across companies.
- Reports, help, and display settings have working destinations.
- Backend duplicate IC failures return a readable HTTP 409 for create and update.
- Development server uses strict port 3000 to avoid accidentally occupying API port 3001.

## Data boundaries

The new reporting endpoint reads existing annual summary, monthly performance, and credit usage tables. No business records or calculation rules were migrated or overwritten. Annual reporting values are distinct from live registration counts and are labelled accordingly. Adding a participant does not silently change the manually allocated company participant count.

## Verification

Run `npm test` for interface regression checks using React Testing Library and a simulated DOM/API. These exercise navigation, search/sort, editors, cancellation, validation, exports, print invocation, failure recovery and mobile navigation behaviour. They do not substitute for visual browser layout inspection or printed-page inspection.

Run `npm run build` and `npm --prefix backend run build` for production compilation.

From `backend`, `node scripts/check-workflows.mjs` exercises the local API/database with uniquely labelled disposable session/company/participant records. Its cleanup removes only the generated session ID with its matching generated reference. Existing business records are not touched. Live checks cover session create/update, same-day dates, company CRUD and totals, grant statuses, participant CRUD and duplicate IC responses.

Browser visual verification was blocked by the computer-use tool because it could not verify the current Chrome URL. Desktop/mobile appearance and print pagination still need a direct visual review.

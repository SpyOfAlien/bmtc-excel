# Lesson planner

Next.js App Router + React + TypeScript + Tailwind CSS v4 + shadcn/ui + AG Grid Community. Deploys to Cloudflare Workers as static assets. Excel import/export run in the browser. Custom lesson templates and saved lesson plans are persisted through a Cloudflare Worker with D1.

The shared shadcn/ui components live in `src/components/ui`, with registry configuration in `components.json`. Tailwind theme tokens and layout styles live in `src/app/globals.css`. AG Grid remains responsible for the two spreadsheet-style tables. Buttons, cards, badges, labels, inputs, notes, native selects and dialogs use shadcn/ui.

## Run locally

Use Node.js 22.12+ or 24+.

```sh
npm ci
npm run db:local
npm run dev:storage
# In another terminal:
npm run dev
```

Open http://localhost:3000. The planner opens immediately using the lesson catalog and export layout stored in `src/data/lesson-template.json`; no Excel template upload is required.

## Deploy to Cloudflare

From this directory:

```sh
npx wrangler login
npm run deploy
```

`npm run deploy` builds the Next.js static export in `out/` and publishes it using `wrangler.jsonc`. The Worker name is `bmtc-lesson-planner`. Wrangler prints the resulting `workers.dev` URL. Change the name in the configuration if you want a different one. If your login has multiple Cloudflare accounts, supply your chosen account ID through `CLOUDFLARE_ACCOUNT_ID`.

For Cloudflare's Git integration, set the root directory to `apps/lesson-planner`, build command to `npm run build`, and deploy command to `npx wrangler deploy`. Use Node 22.12+ or 24+. Set Cloudflare authentication through the hosting service's secret settings if using a separate CI provider; do not commit tokens.

To preview the exact Cloudflare asset configuration locally:

```sh
npm run build
npm run preview
```

The Worker API and static assets in `out/` are deployed together. The bundled JSON catalog and export layout are included in the application. Source Excel files in `ref/`, test data, and the former Python prototype are not included. If deployed on an ordinary `workers.dev` address, the application shell is public; Excel files remain in the browser, while explicitly saved lesson plans and custom lessons are stored in D1. Put the hostname behind Cloudflare Access if your organization requires a restricted app URL.

## Teacher workflow

1. Open the app and start a plan. The built-in catalog loads automatically, with the current month/year; these can be changed when exporting.
2. Enter the child's name and optional age, teacher, QLCM and month/week text.
3. Click `Thêm bài` in the table's final row, or in its center when empty. Search directly in the `Bài số` cell. Select several lessons with the checkboxes and click `Áp dụng`; each selected lesson becomes its own row, in selection order. New rows appear immediately after the edited row. Choose a target score from the reference, or type it if that lesson has no score options. Existing reference values load automatically and stay read-only; missing names, objectives, instructions and criteria become free-text fields. All manual content exports with the lesson. The same lesson cannot appear twice for one child. Drag a row's handle or use its up/down buttons to reorder lessons; manual content, scores and notes move with their lessons and Excel follows this order.
4. Use `Nhập kế hoạch Excel` in the header to import an existing `.xlsx` plan using the same A:F headers at row 8, including files exported by this app. Each plan sheet becomes a student tab with metadata, lessons, scores, and notes in their original order. Imported content remains editable and is preserved on export. Import adds students to the current plans, replacing the initial unnamed empty tab. Codes must exist in the built-in reference, and the combined plans must stay within the student and lesson limits.
5. Add further children. A new child keeps the previous age/teacher/QLCM/period, with an empty name and lesson list.
6. Export one workbook containing one sheet per child in entry order. Names are sanitized and made unique for Excel; the child's displayed name stays intact.

The `Ko dc xoa` table remains searchable and read-only. Blank continuation rows show their parent lesson's context for easier browsing. All original reference rows remain available.

Folder selection for export and direct saving work in supporting browsers such as Chrome and Edge over HTTPS or localhost. Choose the save folder in the export dialog. Existing filenames receive `_v2`, `_v3`, etc. Other browsers can use the download fallback; the browser decides its save location and collision suffix. File name: `KeHoach_Thang{month}_{year}.xlsx`.

Drafts exist only in page memory. Closing or refreshing the page loses unsaved plans. Excel files already exported remain on disk.

## Template compatibility

The app verifies the original column layout: KHGDCN A8:F8 and Ko dc xoa A2:F2. It preserves KHGDCN headers, column widths, fonts, fills, number formats, merges, page settings and logo. Lesson-table cells A:G have permanent thin borders, including empty cells. Rows containing lessons are 120 points high; unused rows use the sheet's default row height (15 points in the sample). Export unhides lesson-table rows, including row 9, which the sample hides. Old lesson values are cleared and new content is exported as values, with no cell formulas. Optional multiline notes entered in the final `Ghi chú` column export to column G and stay with their lesson when reordered. H stays blank below the header. The center headers use the template's cached values. Month/week text appears beneath its existing label in G6:G7.

The original template merges E23:E26. Export skips rows 24–26 so separate lessons keep separate scores without changing the merge. These unused rows keep normal height. Very long text can still be clipped in Excel.

Score keys such as `A5.2` export as `2`. Other score values remain as provided. The sample template has 54 scores stored as dates; these stay as ISO date text rather than guessing an intended range. Lessons with no score options accept a manual target score. A blank `Thang điểm` header in D2 is allowed, while the remaining reference columns retain their original positions. Missing reference fields accept free text; existing values take precedence for lessons selected from the reference. Imported plan rows keep their Excel content and allow edits to every content field. Duplicate source codes use the first group, matching the template's first-match lookup behavior.

Supports .xlsx files up to 30 MB and 150 MB expanded, up to 100 children, and the template's available lesson rows. Macros, external relationships, and embedded objects other than images in KHGDCN are rejected.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Tests use the committed JSON and generate parser fixtures in memory. They verify real lookups, score restrictions, multi-child export, empty student defaults, styles, row/column geometry, merges, images and filename collisions. No local Excel template is required.

The previous Python prototype is retained at `../../tools/lesson-planner` for comparison; this Next.js app is the maintained version.

## Repository template data

`src/data/lesson-template.json` is the versioned source of the lesson catalog, score choices, reference rows, defaults, available plan rows, and Excel export layout. It contains no filled student plans. XML layout and style definitions are stored as strings, with logo assets encoded as base64 so export preserves the original print layout. `src/lib/bundled-template.ts` restores the in-memory structures directly from JSON.

To regenerate this data after an intentional change to the source workbook:

```sh
python3 scripts/generate-template.py /path/to/template.xlsx
```

The source workbook is only needed for regeneration. Running, building, and testing the app use the committed JSON. Tests construct small Excel fixtures from it and verify parsing, editing, and export without local files in `ref/`.

## Lesson templates and saved plans

The default Home screen shows the current user and their saved plans, with search by title or month/year, create, and open actions. The workspace has a Home button and asks before discarding unsaved edits. Only saved plans appear on Home.

- `+ Thêm bài mẫu` creates a reusable lesson with optional score choices and criteria. Codes cannot duplicate either the original JSON catalog or another saved lesson. New lessons appear in both the picker and reference table.
- `Lưu giáo án` saves the entire workspace, including all students, row order, scores, notes, manually entered fields, and snapshots of selected reference content. Unfinished drafts can be saved. Saving an opened plan updates that plan; starting a new plan gives it a new UUID.
- `Mở giáo án` lists and restores saved plans. The stored snapshots keep plan content intact even if the reference catalog later changes. A revision check rejects conflicting updates from another tab.
- Every persistent ID uses the UUID format. Original catalog UUIDs are derived once with UUIDv5 and checked into JSON; new lessons, scores, students, draft rows and plans use UUIDv4. Regenerating the same source codes and score keys retains their IDs. Excel still displays and imports human-readable lesson codes.

The `users` table stores UUID, first_name, last_name and timestamps. Migration 0002 seeds the fixed user and backfills existing lesson/plan owners. Migration 0003 replaces display_name with first_name/last_name and preserves UUIDs and timestamps. The default profile has first_name Hoà; new plans fill the teacher as Cô + first_name. `/api/user` returns the current profile.

For this initial version, the Worker uses the fixed UUID in `worker/storage-api.ts` as the user identity. All users of this installation therefore share the same saved lesson library and plans. This is not authentication. A future login integration should replace the server-side identity resolution; the browser never supplies the owner ID.

### D1 production setup

The production binding `DB` in `wrangler.jsonc` points to `khgdcn` with ID `b37591bb-338b-445d-a444-7d2cc2b4fe1a`. The local database in `wrangler.local.jsonc` is separate.

Apply the database migration once before deploying the storage features:

```sh
npx wrangler login
npm run db:remote
npm run deploy
```

Alternatively, execute `migrations/0001_lessons_and_plans.sql` followed by `migrations/0002_users.sql` and `migrations/0003_user_names.sql` in the Cloudflare D1 console. The migrations create users, lessons/plans tables and indexes without dropping existing tables. When deploying through the existing GitHub connection, keep the build command `npm run build`, deploy command `npx wrangler deploy`, and root directory `apps/lesson-planner`; the database migration is a separate one-time step. CLI migration access requires permission to edit the selected D1 database.

To point at a different database:

```sh
node scripts/configure-d1.mjs database-name database-uuid
```

API paths under `/api/*` are routed to `worker/index.ts`; other requests serve the static assets in `out/`. `npm run dev:storage` starts the local Worker on port 8787. During Next development, `/api/*` is forwarded to that local Worker. The application can still use its original catalog and export Excel while storage is unavailable, and shows a clear error for failed storage requests. Requests and plan snapshots are limited to 1.8 MB to stay within D1's per-row limit.

The API integration tests run against a real isolated local D1 database through Wrangler's platform proxy. They cover duplicate codes, validation, shared identity, saving/reopening drafts, stored snapshots, and revision conflicts.

The sidebar links to three exported routes: `/` (Home), `/plans/` (editor), and `/library/` (lesson library). Saved plans open at `/plans/?id=UUID`, so the URL can be reloaded. The library supports catalog search, lesson details and adding reusable lessons. Sidebar navigation asks before discarding unsaved edits.

## Students and export counts

Migration `0004_students_and_exports.sql` creates `students`, `student_teachers` and `plan_exports`. Existing named students in saved plan snapshots are backfilled with their original UUIDs. The join table allows a student to belong to multiple teachers. Student listing is scoped to the fixed current user. The API supports linking a student to another existing user with `POST /api/students/:id/teachers`, only when the current user already owns a link to that student. Login/user switching and a teacher assignment screen are not implemented yet.

The student picker loads this teacher's list, supports search and multi-select, and lets the teacher create a profile. Creating a profile saves it immediately; choosing it creates a plan tab with a separate tab UUID and `studentId`. Plan metadata remains a snapshot and does not edit the shared student profile. An unnamed empty initial tab is replaced by the selected students. Removing a plan tab does not remove the student profile or other teachers' links. Legacy and imported plan rows without `studentId` remain valid.

Home can export a saved plan without opening the editor. The same export dialog is used by both routes. Every download request or successful directory save for a saved plan records a UUID export event; retrying that event does not increment twice. Opening the dialog or generating a preview does not count. The browser cannot confirm that a user retained a downloaded file; counts represent download requests/directory saves. Unsaved plans can still export but have no stored count until saved. Export events do not change plan revision or updated time. Apply `npm run db:remote` before deploying this feature.

The `/students/` route provides search, create and edit for shared student profiles. Edits use updatedAt for optimistic concurrency and do not rewrite saved plan snapshots. The sidebar collapses to icons by default and can expand. The planner name field has an accessible autocomplete with keyboard selection, fills name/age/studentId, and excludes students already in other tabs.

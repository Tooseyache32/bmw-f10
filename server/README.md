# F10 Anatomy — server integration

This is an educational Node.js 22+ / Express 5 / PostgreSQL application. The existing site is served from the project root, but server code, SQL, tests, dependency files, README files, backup files and all dotfiles are not public. PostgreSQL 18.6 is used in the current isolated local setup; the SQL uses ordinary PostgreSQL relational features.

## Local run

From `C:/Users/Administrator/Desktop/site`:

```sh
npm install
# Copy .env.example to .env only if no local .env exists; never overwrite credentials.
npm run db:migrate
npm run db:seed
npm start
```

Open **http://localhost:3000**. The provided ignored `.env` uses `DATABASE_URL=postgresql://f10_dev@127.0.0.1:55432/f10_anatomy` and `TEST_DATABASE_URL=postgresql://f10_dev@127.0.0.1:55432/f10_anatomy_test`. These are databases provisioned in an isolated development cluster, not the existing system server on port 5432. Scripts do not install PostgreSQL, create/drop databases, reset tables, or alter system services. Migrate/seed refuses names outside the `f10_anatomy` namespace.

`APP_ORIGIN` must exactly match the browser origin for mutations. With the supplied value, use `localhost`, not `127.0.0.1`, in the browser. When publishing, use HTTPS, `NODE_ENV=production`, a correct HTTPS `APP_ORIGIN`, password-authenticated PostgreSQL, restricted network access and a deployment-appropriate connection configuration. Production cookies are Secure. The loopback-only development cluster's trust authentication is **not suitable for deployment**. Express deliberately does not trust forwarded proxy headers; configure deployment deliberately rather than blindly trusting them.

`GET /api/health` checks the HTTP process. `GET /api/ready` checks all nine tables and catalog/topic seed availability. Migrations and seed are explicit operations, never automatic on server startup. Migration applies `001_schema.sql` and the additive `002_car_orders.sql` under one advisory lock. Seed upserts only catalog specifications and topic labels and does not create users.

## Existing-page integration (owned by the main site task)

Do not change field names or existing contact result IDs. Add deferred scripts in this order:

```html
<script src="assets/js/api-client.js" defer></script>
<script src="assets/js/contact-api.js" defer></script>
```

Keep the existing `chapters.js`. On HTTP(S), `contact-api.js` installs **capture-phase** submit/copy/download listeners and `stopImmediatePropagation()` to prevent its local-only handlers and the inline submit handler from claiming a local preparation result. Existing names `name`, `contact`, `interest`, `modification`, `message`, `consent` and IDs `inquiryStatus`, `inquiryResult`, `inquiryText`, `copyInquiry`, `downloadInquiry` are preserved.

Update visible contact descriptions, consent label and submit label to explain that the request is saved **on the educational project server**, not delivered to a dealer or emailed. The API requires boolean `consent: true`. Name/contact/message maximums are 80/160/2000 characters, matching the form. On a network/API failure no success or fake fallback persistence is shown. User-entered fields remain available, but an interrupted response may have committed; the adapter never automatically retries a write.

For existing model pages, include `api-client.js` and deferred `catalog-api.js` after `specs.js` and `chapters.js`. The catalog adapter mutates the same `F10_SPECS.models` object already referenced by chapter interactions, then refreshes the selected model. It visibly marks server data versus a local read-only catalog fallback. File-based/offline viewing still has local catalog data and the existing local text preparation; these are never presented as server persistence. `contact.html?ticket=<opaque-token>` displays a limited status lookup and refresh button. Ticket links are secrets and should not be published; only a token hash is stored in the database.

`account.html` and `admin.html` are complete self-contained pages with only local CSS/JS. Add links to them from the site navigation as desired. Account supports registration/login/logout, own authenticated requests, and server-backed favorite toggles. Admin supports paginated/filterable requests, all four statuses, optional change notes and the event journal. Public registration always creates the `user` role, regardless of request payload.

## Administrator bootstrap

Supply `ADMIN_EMAIL` and a new 12–128 character `ADMIN_PASSWORD` only in the local environment, then run `npm run db:admin`. Remove the password afterward. No built-in credentials exist. The command inserts a new admin; it refuses duplicate email rather than silently changing an existing account. Do not use passwords from real services for this development demonstration. Log in on `account.html`, then open `admin.html`. Hiding a panel is not authorization: every admin API route checks the server-side session and role.

## Nine-table schema

1. `users`: unique normalized email, display name, salted scrypt password hash, checked `user`/`admin` role.
2. `sessions`: SHA-256 hash of a 256-bit opaque cookie token, optional user foreign key, CSRF token and seven-day expiry.
3. `vehicle_models`: catalog identity, July 2013 scope, description and source URLs.
4. `model_specs`: one-to-one model FK/PK, fuel/cylinders/displacement, hp/kW/torque, acceleration/consumption/speed and RPM ranges.
5. `inquiry_topics`: four selectable topics (`selection`, `vehicle`, `service`, `other`).
6. `inquiries`: optional user FK, required topic and optional model FKs, name/contact/message, consent timestamp, checked status, unique public ticket hash and timestamps.
7. `inquiry_events`: inquiry/admin FKs, previous/next checked status, note and timestamp.
8. `favorites`: user/model composite primary key, preventing duplicates.
9. `car_orders`: optional user and required vehicle-model foreign keys, name, phone, city, optional integer budget in rubles, wishes, consent timestamp and checked status. `order.html` contains only the order form. Successful `POST /api/car-orders` returns HTTP 201 with the saved order number; it does not charge money or create a purchase contract.

Seed reads the existing `assets/js/specs.js` as the single source of truth. Europe, from July 2013, RWD, eight-speed Steptronic, official combined EU cycle and stated tire scope are retained. Seeded model tuples (hp / Nm / 0–100 seconds / l/100 km / cc / kW): `520d 184/380/7.9/4.5/1995/135`, `528i 245/350/6.3/6.1/1997/180`, `535i 306/400/5.7/7.2/2979/225`.

## API routes

All responses are JSON. Mutations require `Content-Type: application/json`, exact same `Origin`, the session cookie and `X-CSRF-Token` from `GET /api/auth/me`. No permissive CORS is enabled.

| Method | Path | Access / purpose |
| --- | --- | --- |
| GET | `/api/health` | Public liveness |
| GET | `/api/ready` | Public DB/schema/seed readiness |
| GET | `/api/models` | Public catalog with joined specs |
| GET | `/api/topics` | Public topic list |
| GET | `/api/auth/me` | Initialize anonymous session or return user plus CSRF |
| POST | `/api/auth/register` | Register, rotate session, HTTP 201 |
| POST | `/api/auth/login` | Verify scrypt, rotate session |
| POST | `/api/auth/logout` | Invalidate session, clear cookie |
| POST | `/api/inquiries` | Guest/user real INSERT, HTTP 201, one-time ticket token |
| POST | `/api/car-orders` | Guest/user session, Origin and CSRF; validate and save car application, HTTP 201 |
| GET | `/api/tickets/:token` | Public response contains **only `{status}`**, never PII |
| GET | `/api/inquiries` | Own authenticated requests, latest 100 |
| GET | `/api/favorites` | Own saved models |
| PUT / DELETE | `/api/favorites/:slug` | Save/remove a model |
| GET | `/api/admin/inquiries?status=&page=1` | Admin; 50 per page with count |
| PATCH | `/api/admin/inquiries/:id/status` | Admin; `{status,note?}` transaction |
| GET | `/api/admin/inquiries/:id/events` | Admin; status journal |

Statuses: `new`, `in_progress`, `completed`, `rejected`. An actual status change locks the inquiry row, updates status and inserts its event in one PostgreSQL transaction; a repeated identical status adds no duplicate event. No delete UI, dealer delivery or external mail service is claimed.

Security: HttpOnly/SameSite=Lax cookie (Secure in production), random session/ticket tokens stored hashed, session rotation at login/register, password scrypt plus timing-safe comparison, parameterized SQL, role checks, field/JSON bounds (16 KB), bounded in-process per-IP rate limits, no request/secret/stack logging, hidden internal errors and explicit static-file allowlist. Rate limits are intentionally basic and process-local; a multi-instance deployment needs a shared limiter. API responses use `Cache-Control: no-store`.

## Verification

```sh
npm test
```

The Node built-in runner uses `TEST_DATABASE_URL` only for integration. It refuses names not matching the dedicated `f10_anatomy*_test` convention before any connection or write. No URL means integration is explicitly skipped, not silently run against production. Tests migrate/seed the dedicated test DB and delete only IDs created by the run, never TRUNCATE/DROP. Coverage includes actual PostgreSQL insertion, seed values, cookie hash/rotation, validation, origin/CSRF, ticket privacy, user isolation, favorites uniqueness, admin checks, status journal transactions (including injected event-insert failure/rollback), static source protection, JSON bounds and logout invalidation. Security unit tests cover password hashing/verification, input validation, tokens, rate limits and database guards. GUI/browser checks are separate and not claimed by this suite.

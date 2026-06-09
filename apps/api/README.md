# English-Platform API

MVP backend for an online English-tutoring platform. Built with **NestJS 10**,
**Prisma**, JWT auth, class-validator, `@nestjs/config`, and `nestjs-i18n`.

Vertical slices: registration/login with access + refresh tokens, a protected
`/me`, profile updates, lesson creation/listing/rescheduling, a student booking
flow, attendance, and a full **billing** module (Stripe/PayPal checkout,
signature-verified webhooks, ledger-based balance, lesson packages, invoices,
and automatic charging when a lesson is completed).

## Tech & data store

- **Dev/test:** SQLite (`file:./dev.db`, `file:./test.db`).
- **Production:** PostgreSQL. The Prisma `datasource` always reads
  `env("DATABASE_URL")`; only the connection string changes between
  environments.
- SQLite does **not** support Prisma `enum`s, so every "enum-like" field is a
  `String`. Allowed values are documented inline in `prisma/schema.prisma` and
  enforced in code via string-literal unions in
  `src/common/constants/enums.ts`.
- JSON blobs (`fileUrls`, `payload`) are stored as serialized `String` for
  portability.

## Setup

```bash
cd apps/api
cp .env.example .env          # adjust secrets as needed
npm install
npm run prisma:generate       # generate the Prisma client
npm run prisma:push           # create/sync the SQLite dev.db (no migration files)
npm run seed                  # optional: seed a tutor + 2 students + lessons
```

> We use `prisma db push` (not `migrate dev`) for the SQLite dev/test database
> because it provisions the schema without requiring migration history — ideal
> for a fast MVP slice. For Postgres in production you would switch to
> `prisma migrate deploy`.

## Run

```bash
npm run start:dev             # http://localhost:3000/api/v1
```

Quick smoke check: `GET http://localhost:3000/api/v1/health` -> `{"status":"ok"}`.

## Seed accounts

All seeded users share the password `Password123!`:

| email                     | role    | locale |
| ------------------------- | ------- | ------ |
| tutor@example.com         | tutor   | en     |
| student.ru@example.com    | student | ru     |
| student.ar@example.com    | student | ar     |

## API (prefix `/api/v1`)

| Method | Path                       | Auth          | Notes                                   |
| ------ | -------------------------- | ------------- | --------------------------------------- |
| GET    | /health                    | -             | `{status:"ok"}`                         |
| POST   | /auth/register             | -             | `{accessToken, refreshToken}`           |
| POST   | /auth/login                | -             | `{accessToken, refreshToken}`           |
| POST   | /auth/refresh              | -             | rotates the refresh token               |
| GET    | /auth/me                   | JWT           | profile + localized greeting            |
| GET    | /users/me                  | JWT           | profile incl. tutor/student profile     |
| PATCH  | /users/me                  | JWT           | update locale/timezone/profile          |
| POST   | /lessons                   | JWT, tutor    | create a lesson                         |
| GET    | /lessons                   | JWT           | tutor: own; student: participating      |
| GET    | /lessons/:id               | JWT           | only participants/owner/admin           |
| PATCH  | /lessons/:id               | JWT, tutor    | reschedule / cancel                     |
| POST   | /lessons/:id/book          | JWT, student  | creates a `LessonParticipant`           |
| POST   | /lessons/:id/join          | JWT           | LiveKit room token (participants/owner) |
| POST   | /lessons/:id/attendance    | JWT           | mark present/absent/late                |
| POST   | /homework                  | JWT, tutor    | assign homework to a student            |
| GET    | /homework                  | JWT           | tutor: assigned; student: theirs        |
| GET    | /homework/:id              | JWT           | owner tutor / assigned student          |
| POST   | /homework/:id/submit       | JWT, student  | submit work (content + fileUrls)        |
| POST   | /homework/:id/grade        | JWT, tutor    | grade + feedback on a submission        |
| POST   | /crm/students              | JWT, tutor    | enroll a student by email               |
| GET    | /crm/students              | JWT, tutor    | students + lesson/attendance summary    |
| GET    | /crm/students/:id          | JWT, tutor    | card: profile, lessons, homework, notes |
| POST   | /crm/students/:id/notes    | JWT, tutor    | add a private note                      |
| GET    | /crm/students/:id/notes    | JWT, tutor    | list private notes                      |
| GET    | /billing/packages          | JWT           | tutor: own; student: active packages    |
| POST   | /billing/packages          | JWT, tutor    | create a tariff/package                 |
| GET    | /billing/balance           | JWT, student  | balance + remaining package lessons     |
| GET    | /billing/transactions      | JWT           | own transaction history                 |
| GET    | /billing/invoices          | JWT           | own invoices (in payer's locale)        |
| POST   | /billing/checkout          | JWT, student  | start Stripe/PayPal checkout            |
| POST   | /billing/webhook/:provider | signature     | provider webhook (no JWT)               |
| POST   | /materials                 | JWT, tutor    | add a material to the library           |
| GET    | /materials                 | JWT           | tutor: own; student: enrolled tutors'   |
| GET    | /materials/:id             | JWT           | owner / enrolled student / admin        |
| DELETE | /materials/:id             | JWT, tutor    | delete own material                     |
| GET    | /notifications             | JWT           | own in-app notifications                |
| PATCH  | /notifications/:id/read    | JWT           | mark as read                            |
| POST   | /notifications/dispatch    | JWT, admin    | flush the queue (worker simulation)     |
| GET    | /analytics/overview        | JWT, tutor    | revenue, lessons, attendance, conversion|

### Billing & payments

- **Provider abstraction** (`src/billing/providers`): `stripe` and `paypal`
  adapters behind a `PaymentProvider` interface, resolved by a registry. Local
  providers (Tunisia/CIS) can be added without touching `BillingService`.
- **Checkout** creates a `pending` `Transaction`, asks the provider for a
  checkout session, and stores its id as `externalId`.
- **Webhooks** are unauthenticated but **signature-verified** (HMAC-SHA256 over
  the raw body with `*_WEBHOOK_SECRET`; requires the app's `rawBody: true`).
  Processing is **idempotent** by `externalId` — replays are ignored.
- **Balance** is ledger-based: each money movement is a signed `LedgerEntry`;
  `StudentProfile.balanceCents` is a denormalized cache updated in the same DB
  transaction. Package purchases grant `StudentPackage` lessons instead of cash.
- **Auto-charge**: completing a lesson (`PATCH /lessons/:id {status:"completed"}`)
  consumes a package lesson if available, otherwise debits the cash balance —
  idempotent per (lesson, student).
- **Invoices** are issued on successful payment in the payer's locale.

### Notifications

`NotificationsService.enqueue` captures the recipient's `locale` at enqueue time
so messages render in their language even if they later switch. Triggers are
wired for homework assignment and lesson booking. `POST /notifications/dispatch`
simulates the BullMQ worker: it renders each queued item via `nestjs-i18n` and
marks it `sent` (in production this would also send email/Telegram).

### Materials

A material keeps the **language of its original content** and is never
auto-translated (only the UI is localized). Tutors own their library; enrolled
students get read-only access to their tutors' materials.

### Analytics

`GET /analytics/overview` aggregates the tutor dashboard KPIs: revenue from
completed lessons, completed/upcoming counts, active students, attendance rate,
and trial→paid conversion.

### Video (LiveKit)

`POST /lessons/:id/join` returns `{ roomName, url, token }` where `token` is a
LiveKit access JWT (HS256, signed with `LIVEKIT_API_SECRET`, carrying a `video`
grant for the lesson room). We target **LiveKit Cloud** (managed SFU) for HD
video, screen share, recording and group rooms; the token is generated without
the `livekit-server-sdk` dependency (`src/video/livekit.service.ts`).

### i18n

The request locale is resolved from `?lang=` / `?locale=`, an `x-lang` header,
or `Accept-Language` (fallback `en`). Translations live in `src/i18n/<lang>/`
for `en, ru, de, fr, nl, ar`. `GET /auth/me` greets the user in their stored
locale; failed logins return a localized `auth.invalid_credentials` message.

## Tests

```bash
npm test          # unit tests (AuthService)
npm run test:e2e  # e2e (supertest) against a fresh ./test.db
```

The e2e suite (`test/setup-e2e.ts`) forces `DATABASE_URL=file:./test.db` and
wipes the database before/after the run, so it never touches your dev data.
Before running e2e the first time, make sure the test DB schema exists:

```bash
DATABASE_URL="file:./test.db" npx prisma db push
```

(The npm `pretest:e2e` is not auto-wired; run the push once or whenever the
schema changes.)

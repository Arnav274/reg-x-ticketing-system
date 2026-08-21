# AI Ticketing System

An embeddable feedback/ticketing widget for logged-in users of an existing product. It auto-captures
who the user is and which page they're on, uses an AI model to suggest a category
(High/Medium/Low/Suggestion/Request) for a free-text issue description, and lets the user accept or
override that suggestion before submitting. Tickets are persisted via a REST API into Postgres,
tagged by page and category, so the product's surfaces can be compared by issue volume and severity.

**Stack:** TypeScript throughout. Backend is Express 5 on Node 24 with `pg` against Postgres 16,
containerised with Docker Compose. Frontend is React 19 built with Vite, run as its own npm project.
Classification calls an OpenAI-compatible provider endpoint (Groq by default).

## How it fits together

Two independent npm projects, `backend/` and `frontend-widget/`, with no workspace between them and
no shared build. They communicate only over HTTP, which is why a few small constants such as the
category list and the product names are deliberately mirrored on both sides rather than imported
across the boundary.

The widget is designed to be embedded into an existing product's pages. It recognises four product
surfaces from the first segment of the page URL:

| Page | Product recorded on the ticket |
|---|---|
| `/analytics-hub` | Analytics Hub |
| `/user-portal` | User Portal |
| `/billing-engine` | Billing Engine |
| `/settings-suite` | Settings Suite |

A ticket makes this round trip:

1. The widget loads, detects the product from the URL, and obtains a JWT for the current user. Note
   that in a real host application the token comes from that application's own auth; locally it comes
   from the development token endpoint described below.
2. The user types a description. Half a second after they stop typing, the widget posts the text to
   `POST /api/v1/tickets/classify`. The backend asks the provider for one of the five allowed
   categories, and returns a suggestion only if the answer is one of those five. Anything else,
   including a provider error or timeout, yields no suggestion at all.
3. The suggested category pre-fills a dropdown that stays fully editable, so the user can override
   it. What the AI proposed is stored separately from what the user finally chose, which is what
   makes the override rate measurable later.
4. Submitting posts to `POST /api/v1/tickets/create` with the token in an `Authorization` header. The
   backend verifies the JWT, validates the body, applies a per-user hourly rate limit, and inserts
   the row.
5. `GET /api/v1/tickets` reads them back with optional product, category and date-range filters. The
   admin page is a thin client over that endpoint.
6. Every ticket carries a lifecycle status of `open`, `in progress` or `resolved`, starting at `open`.
   `PATCH /api/v1/tickets/:ticket_id/status` changes it. The admin page exposes this as a dropdown in
   each row of the table; changing it calls the endpoint directly and the row reflects the new status
   immediately, with no page reload.

The username and email written to a ticket are always taken from the verified JWT, never from the
request body, so a client cannot file a ticket as somebody else.

## Requirements

Docker with Compose v2, and Node.js 24 for the widget's dev server.

## Quick start

```sh
cp .env.example .env
```

Then open `.env` and set:

```
DEV_AUTH_ENABLED=true
```

This is required locally and is the one edit the defaults do not make for you. It mounts the
development token endpoint that both the widget and the admin page depend on for a usable JWT.
Leaving it `false` starts the stack perfectly happily, but the widget will sit on "Connecting to your
account..." and never enable its submit button. See the section on it below before deploying
anything.

Start the backend and database:

```sh
docker compose up --build
```

That brings up Postgres and the backend on `http://localhost:3000`. Confirm with `GET /health`. The
database schema is applied automatically the first time the `db` volume is created.

The widget is not containerised, so run its dev server separately, in a second terminal:

```sh
cd frontend-widget
npm install
npm run dev
```

Then open `http://localhost:5173/analytics-hub`.

### AI classification

`.env.example` ships `AI_PROVIDER_API_KEY` as a placeholder. Left as-is, everything runs normally but
category suggestions always fail and the widget falls back to manual selection. That fallback is
intended behaviour, not a failure state. AI mode is designed to degrade quietly rather than block
ticket submission.

For live suggestions, replace the placeholder with a real [Groq](https://console.groq.com) API key.

## Pages to open

All five of the URLs below are served by the widget's Vite dev server, and their routing lives in
`frontend-widget/vite.config.ts`. They are development surfaces only: `npm run build` emits just the
embeddable widget bundle (`dist/index.html` and one JS asset) and none of these pages.

| URL | What it is |
|---|---|
| `http://localhost:5173/analytics-hub` | Simulated product page, detected as Analytics Hub |
| `http://localhost:5173/user-portal` | Simulated product page, detected as User Portal |
| `http://localhost:5173/billing-engine` | Simulated product page, detected as Billing Engine |
| `http://localhost:5173/settings-suite` | Simulated product page, detected as Settings Suite |
| `http://localhost:5173/admin` | Filterable table of every submitted ticket |

## Demo walkthrough

No screenshots are committed, so this is the whole loop in prose:

1. Open `http://localhost:5173/analytics-hub` and click **Report an Issue**. The form shows
   "Submitting as: johndoe (johndoe@example.com)", taken from the token rather than typed, and
   "Product: Analytics Hub", taken from the URL rather than chosen.
2. Type a clearly severe description, for example "Checkout is completely down for all users and
   nobody can pay". Pause. With a real API key configured, the category dropdown fills itself in with
   the suggestion within about a second. Without one, it stays empty and you pick a category by hand,
   which is the intended fallback.
3. Change the category to something else if you like. The override is kept, and the original
   suggestion is still recorded alongside it.
4. Click **Submit**. The form confirms with "Ticket submitted successfully."
5. Untick **AI mode** and submit a second ticket. The dropdown becomes a plain manual selector and no
   classification request is made at all.
6. Open `http://localhost:5173/admin`. Both tickets are listed, newest first, with a summary panel
   above the table showing bar counts by product and by category for whatever the current filters
   match. The AI suggestion column shows the suggested category for the first and "AI off" for the
   second. Narrow the table with the product, category and date filters; each one maps onto a query
   parameter of `GET /api/v1/tickets`.
7. Change one ticket's status using the dropdown in its row. The change is sent immediately via
   `PATCH /api/v1/tickets/:ticket_id/status` and the row updates in place.
8. To see the same data from the other side, open a different product page such as
   `http://localhost:5173/billing-engine`, submit a third ticket, and filter the admin table by
   Billing Engine.

## Development authentication

`DEV_AUTH_ENABLED` controls whether `POST /api/v1/dev/token` is mounted. When it is `true`, that
endpoint issues a signed one hour JWT for a single fixed demo identity, with no authentication in
front of it. It takes no input: it will only ever sign that one identity, so switching it on by
mistake cannot be used to impersonate an arbitrary user. Any other value, including leaving it unset,
leaves the route unmounted and the URL returns 404.

Both the widget and the admin table need it locally, because neither has a real host application to
inherit a token from. It must stay `false` in any deployed environment. The backend logs a warning at
startup whenever it is enabled.

## Known limitations

These are real gaps in the current state of the project, not caveats.

**Migrations apply on a fresh volume only.** `docker-compose.yml` mounts `backend/src/db/migrations`
into `/docker-entrypoint-initdb.d`, and Postgres runs the files there only on the *first*
initialisation of an empty data directory. `001_`, `002_` and `003_` therefore all apply
automatically on a clean start and never again. There is still no migration runner.

On a **fresh** volume you need nothing beyond the normal start. On a volume that already exists, a
newly added migration has to be applied by hand. `003_add_ticket_status.sql` is the first one this
has applied to, and because the migrations directory is already mounted into the container, the file
is there without copying anything:

```sh
docker compose exec -T db psql -U user -d tickets -f /docker-entrypoint-initdb.d/003_add_ticket_status.sql
```

On Git Bash for Windows, prefix that with `MSYS_NO_PATHCONV=1`, or the leading `/` is rewritten into
a Windows path before Docker ever sees it and `psql` reports the file as missing.

The alternative reset destroys all data:

```sh
docker compose down -v
docker compose up --build
```

**Access is authenticated but not role-based, for reads and now for writes.** `GET /api/v1/tickets`
requires a valid JWT and nothing more, so any authenticated user reads every ticket, including other
users' email addresses and issue text. `PATCH /api/v1/tickets/:ticket_id/status` is the same: any
authenticated user can change the status of any ticket, and nothing records who changed it. There is
no admin role and no per-user filtering. The admin page is not a privileged surface; it is an
ordinary client of those endpoints.

**Rate limiting is in-memory.** Submission limits are counted in the backend process, so they work
for the single instance this project runs and nothing more. Counts reset whenever the process
restarts, a second instance would keep its own separate counts and effectively double the limit, and
the window is fixed rather than sliding.

**No TLS and no encryption at rest.** The API is served over plain HTTP and the database stores
ticket text, usernames and email addresses unencrypted. Both are properties of a deployment target
that does not exist yet, so neither has been configured.

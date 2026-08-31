# WMU Dining Services — Inventory Management

Internal web app for Western Michigan University Dining Services. Manages the commissary master inventory, cafe item requests, fulfillment, and transfer reporting.

---

## Overview

| Role | Access |
|------|--------|
| **Admin** | Full access — manage users, inventory, fulfillment, reports, export |
| **Commissary** | Inventory, fulfillment queue, reports, export |
| **Cafe** | Submit item requests for their assigned cafe |
| **Driver** | View fulfillment queue |

**Login:** Email + password. Admin creates all accounts and sets passwords. No self-service sign-up.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Database:** PostgreSQL on [Neon](https://neon.tech) (serverless)
- **Auth:** Custom session-based (bcrypt passwords, cookie sessions)
- **Hosting:** [Vercel](https://vercel.com)
- **Styling:** Tailwind CSS

---

## Local Development

### Prerequisites

- Node.js 18+
- Access to the Neon database (get connection string from the commissary admin account)

### Setup

```bash
npm install
```

Create a `.env.local` file in the project root:

```env
DATABASE_URL=postgresql://...   # Neon connection string
```

### Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

---

## Database

All migrations live in `db/` and are numbered sequentially (`001_...sql` → `023_...sql`). Run them in order against Neon using `psql`:

```bash
psql "$DATABASE_URL" -f db/001_inventory_schema.sql
```

To run a new migration after pulling changes:

```bash
psql "$DATABASE_URL" -f db/023_password_auth.sql
```

### Key tables

| Table | Purpose |
|-------|---------|
| `items` | Master inventory (SKU, name, category, unit) |
| `item_prices` | Price history per item (case price, unit price) |
| `item_cafe_visibility` | Which items each cafe can see/request |
| `item_tags` | Many-to-many item ↔ tag |
| `tags` | Tag definitions (food, non-food, etc.) |
| `cafes` | Cafe list |
| `stock_requests` | Cafe item requests |
| `stock_request_lines` | Line items per request |
| `user_roles` | Users, roles, bcrypt password hashes |
| `sessions` | Active login sessions |
| `audit_log` | Append-only audit trail |

---

## Project Structure

```
src/
  app/
    page.tsx              # Dashboard + login
    admin/page.tsx        # User management (admin only)
    admin/tags/page.tsx   # Tag management (admin only, direct URL)
    fulfillment/          # Fulfillment queue and receipt pages
    request/              # Cafe request submission
    reports/page.tsx      # Transfer summary report
    api/
      auth/               # login, session, sign-out
      admin/users/        # user CRUD + password reset
      inventory/          # items CRUD, export CSV
      fulfillment/        # fulfillment actions
      reports/            # transfer summary data
      tags/               # tag CRUD
      cafes/              # cafe list
  lib/
    db.ts                 # pg pool singleton
    session-store.ts      # session create/read/destroy
    require-role.ts       # auth middleware helper
    audit.ts              # audit log writer
  components/
    SignOutButton.tsx

db/                       # SQL migration files (001–023)
scripts/
  set-password.mjs        # CLI: set a user's password directly
```

---

## User Management

### Creating a user

Go to `/admin` → Grant Access form. Enter the user's `@wmich.edu` email, assign a role, and set an initial password (min 6 characters).

### Resetting a password

Go to `/admin` → find the user in the table → click **Reset** in the Password column.

Or use the CLI script (useful if the admin account itself is locked out):

```bash
node scripts/set-password.mjs <email> <new-password> "<DATABASE_URL>"
```

### Roles and restrictions

- Only `@wmich.edu` emails are allowed.
- The primary admin account (`benwin.george@wmich.edu`) cannot be revoked from the UI.
- Admins cannot remove their own access.

---

## Deployment

The app is deployed on **Vercel** connected to the GitHub repo. Every push to `master` triggers a redeploy.

### Environment variables (Vercel)

Set these under **Project → Settings → Environment Variables**:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |

---

## Accounts & Services

| Service | Account |
|---------|---------|
| Neon (database) | Commissary Gmail account |
| Vercel (hosting) | Commissary Gmail account |
| GitHub (repo) | Commissary Gmail account |

---

## Inventory Export

Admin and commissary users can download the full inventory as a CSV from the Dashboard header (**Export CSV** button). The file is named `wmu-inventory-YYYY-MM-DD.csv` and includes SKU, name, category, unit type, pricing, tags, and cafe visibility. Download this periodically as a physical backup.

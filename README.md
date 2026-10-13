# TripSplit

A Splitwise-style expense tracker for group trips. Create a trip, add your friends, log who paid for what, split it any way you like, and see exactly who owes whom, with full spending analytics, shared notes and trip documents in one place.

## Features

- **Accounts**: sign up / log in (JWT auth, bcrypt-hashed passwords).
- **Trips (groups)**: name, description, currency, dates. The creator is the owner; members are added by the email they signed up with.
- **Expenses**: description, amount, category, date, payer, notes. Search and filter by category or payer.
- **Split types**: equally, exact amounts, percentages, or shares, with a live per-person preview and validation. Rounding is done in integer cents so splits always add up exactly.
- **Balances & settle up**: each member's paid / share / net balance, a minimal "who pays whom" plan, and recorded payments (settlements) with history.
- **Analytics**: total, per person, daily average, average and largest expense, settled vs outstanding, your personal position, spending by category (donut + table), spending over time (daily + running total), paid vs share per person, category breakdown per person, top expenses.
- **Notes**: shared, pinnable notes per trip (itineraries, packing lists, check-in info).
- **Documents**: upload tickets, bookings, IDs and receipts (up to 15 MB each); view or download them later.

## Tech stack

- **Backend**: Node.js (22.13+) + Express, built-in `node:sqlite` (no native build step), Multer for uploads.
- **Frontend**: React 18 + Vite, React Router, Recharts.

## Getting started

```bash
npm install
npm run seed   # optional: demo users + a sample "Goa Getaway" trip
npm run dev    # API on http://localhost:4000, app on http://localhost:5173
```

Open http://localhost:5173. With demo data, log in as `aarav@demo.com` (or `priya@`, `rohan@`, `sara@demo.com`), password `password`.

### Production

```bash
npm run build  # builds the frontend into dist/
npm start      # serves the API and the built app on http://localhost:4000
```

### Configuration

| Variable     | Default         | Purpose                                        |
| ------------ | --------------- | ---------------------------------------------- |
| `PORT`       | `4000`          | API / app port                                 |
| `DATA_DIR`   | `server/data`   | SQLite database and uploaded files             |
| `JWT_SECRET` | auto-generated  | Token signing secret (persisted in `DATA_DIR`) |

## Project structure

```
server/
  index.js          Express app, error handling, static hosting of dist/
  db.js             SQLite schema and query helpers
  auth.js           JWT + trip membership / ownership middleware
  ledger.js         Split calculation, balances and settle-up simplification
  routes/           auth, trips + members, expenses, settlements, analytics, notes, documents
  seed.js           Demo data
client/src/
  pages/            Auth, Dashboard, TripPage and its tabs
  components/       Expense form, trip form, shared UI
```

## Rules worth knowing

- Any trip member can add, edit or delete expenses and payments.
- Only the owner can edit or delete the trip or remove other members. Members can leave on their own.
- A member who is part of any expense or payment can't be removed until those entries are changed, so balances always stay consistent.
- Notes can be edited by anyone in the trip and deleted by their author or the owner. Documents can be deleted by the uploader or the owner.

import { Router } from 'express';
import { all, get } from '../db.js';
import { computeBalances } from '../ledger.js';

const router = Router();
const DAY_MS = 86_400_000;

const toDay = (iso) => Date.parse(`${iso}T00:00:00Z`);
const fromDay = (ms) => new Date(ms).toISOString().slice(0, 10);

router.get('/', (req, res) => {
  const tripId = req.tripId;
  const trip = get('SELECT * FROM trips WHERE id = ?', tripId);
  const expenses = all(
    `SELECT e.id, e.description, e.amount_cents, e.category, e.expense_date, e.paid_by, u.name AS payer_name
       FROM expenses e JOIN users u ON u.id = e.paid_by
      WHERE e.trip_id = ?
      ORDER BY e.expense_date, e.id`,
    tripId,
  );
  const shares = all(
    `SELECT s.user_id, s.amount_cents, e.category
       FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
      WHERE e.trip_id = ?`,
    tripId,
  );
  const settled = get('SELECT COALESCE(SUM(amount_cents), 0) AS c, COUNT(*) AS n FROM settlements WHERE trip_id = ?', tripId);
  const { balances, suggestions } = computeBalances(tripId);

  const totalCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);

  const categories = new Map();
  for (const e of expenses) {
    const c = categories.get(e.category) ?? { category: e.category, totalCents: 0, count: 0 };
    c.totalCents += e.amount_cents;
    c.count += 1;
    categories.set(e.category, c);
  }
  const byCategory = [...categories.values()].sort((a, b) => b.totalCents - a.totalCents);

  const daily = new Map();
  for (const e of expenses) daily.set(e.expense_date, (daily.get(e.expense_date) ?? 0) + e.amount_cents);
  const byDate = [];
  if (expenses.length) {
    const first = toDay(expenses[0].expense_date);
    const last = toDay(expenses[expenses.length - 1].expense_date);
    const fillGaps = (last - first) / DAY_MS <= 120;
    const days = fillGaps
      ? Array.from({ length: (last - first) / DAY_MS + 1 }, (_, i) => fromDay(first + i * DAY_MS))
      : [...daily.keys()];
    let running = 0;
    for (const d of days) {
      const cents = daily.get(d) ?? 0;
      running += cents;
      byDate.push({ date: d, totalCents: cents, cumulativeCents: running });
    }
  }

  let dayCount = 1;
  if (trip.start_date && trip.end_date) {
    dayCount = (toDay(trip.end_date) - toDay(trip.start_date)) / DAY_MS + 1;
  } else if (expenses.length) {
    dayCount = (toDay(expenses.at(-1).expense_date) - toDay(expenses[0].expense_date)) / DAY_MS + 1;
  }

  const memberCategory = new Map(balances.map((b) => [b.userId, { userId: b.userId, name: b.name }]));
  for (const s of shares) {
    const row = memberCategory.get(s.user_id);
    if (row) row[s.category] = (row[s.category] ?? 0) + s.amount_cents;
  }

  const me = balances.find((b) => b.userId === req.user.id);

  res.json({
    currency: trip.currency,
    totals: {
      totalCents,
      expenseCount: expenses.length,
      averageExpenseCents: expenses.length ? Math.round(totalCents / expenses.length) : 0,
      dailyAverageCents: Math.round(totalCents / dayCount),
      perPersonCents: balances.length ? Math.round(totalCents / balances.length) : 0,
      dayCount,
      memberCount: balances.length,
      settledCents: settled.c,
      settlementCount: settled.n,
      outstandingCents: balances.reduce((sum, b) => sum + Math.max(b.netCents, 0), 0),
    },
    me: me ?? null,
    largestExpense: expenses.reduce((max, e) => (!max || e.amount_cents > max.amount_cents ? e : max), null),
    byCategory,
    byDate,
    byMember: balances,
    memberCategory: {
      categories: byCategory.map((c) => c.category),
      rows: [...memberCategory.values()],
    },
    topExpenses: [...expenses].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 5),
    suggestions,
  });
});

export default router;

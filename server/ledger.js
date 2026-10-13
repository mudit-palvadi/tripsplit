import { all } from './db.js';
import { fail } from './http.js';

/**
 * Splits `totalCents` proportionally to each entry's weight. Leftover cents from
 * rounding go to the entries with the largest fractional remainder so the parts
 * always add up exactly to the total.
 */
export function distribute(totalCents, entries) {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  const parts = entries.map((e) => {
    const exact = (totalCents * e.weight) / totalWeight;
    const cents = Math.floor(exact);
    return { userId: e.userId, value: e.value ?? null, cents, frac: exact - cents };
  });
  let remainder = totalCents - parts.reduce((sum, p) => sum + p.cents, 0);
  const byFraction = [...parts].sort((a, b) => b.frac - a.frac);
  for (let i = 0; remainder > 0; i = (i + 1) % byFraction.length, remainder--) {
    byFraction[i].cents += 1;
  }
  return parts.map(({ userId, value, cents }) => ({ userId, value, cents }));
}

export function computeSplits({ amountCents, splitType, splits, memberIds }) {
  if (!Array.isArray(splits) || splits.length === 0) {
    fail(400, 'Select at least one person to split with');
  }

  const seen = new Set();
  const entries = splits.map((s) => {
    const userId = Number(s?.userId);
    if (!memberIds.has(userId)) fail(400, 'A split includes someone who is not in this trip');
    if (seen.has(userId)) fail(400, 'A person appears twice in the split');
    seen.add(userId);
    if (splitType === 'equal') return { userId, value: null, weight: 1 };
    const value = Number(s.value);
    if (!Number.isFinite(value) || value < 0) fail(400, 'Split values must be zero or positive numbers');
    return { userId, value, weight: value };
  });

  const active = entries.filter((e) => e.weight > 0);
  if (active.length === 0) fail(400, 'Select at least one person to split with');

  switch (splitType) {
    case 'equal':
      return distribute(amountCents, active);

    case 'exact': {
      const parts = active.map((e) => ({ userId: e.userId, value: e.value, cents: Math.round(e.value * 100) }));
      const sum = parts.reduce((total, p) => total + p.cents, 0);
      if (sum !== amountCents) {
        fail(400, `Exact amounts add up to ${(sum / 100).toFixed(2)} but the expense is ${(amountCents / 100).toFixed(2)}`);
      }
      return parts.filter((p) => p.cents > 0);
    }

    case 'percent': {
      const pct = active.reduce((total, e) => total + e.value, 0);
      if (Math.abs(pct - 100) > 0.01) fail(400, `Percentages add up to ${pct.toFixed(2)}%, they must total 100%`);
      return distribute(amountCents, active);
    }

    case 'shares':
      return distribute(amountCents, active);

    default:
      fail(400, 'Split type must be one of: equal, exact, percent, shares');
  }
}

/**
 * Net balance per member: positive means the group owes them money,
 * negative means they owe the group.
 */
export function computeBalances(tripId) {
  const members = all(
    `SELECT u.id, u.name, u.email, tm.role
       FROM trip_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.trip_id = ?
      ORDER BY tm.joined_at, u.id`,
    tripId,
  );

  const byId = new Map(
    members.map((m) => [
      m.id,
      { userId: m.id, name: m.name, paidCents: 0, shareCents: 0, sentCents: 0, receivedCents: 0, netCents: 0 },
    ]),
  );
  const add = (userId, key, cents) => {
    const row = byId.get(userId);
    if (row) row[key] += cents;
  };

  for (const r of all('SELECT paid_by AS uid, SUM(amount_cents) AS c FROM expenses WHERE trip_id = ? GROUP BY paid_by', tripId)) {
    add(r.uid, 'paidCents', r.c);
  }
  for (const r of all(
    `SELECT s.user_id AS uid, SUM(s.amount_cents) AS c
       FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
      WHERE e.trip_id = ? GROUP BY s.user_id`,
    tripId,
  )) {
    add(r.uid, 'shareCents', r.c);
  }
  for (const r of all('SELECT from_user AS uid, SUM(amount_cents) AS c FROM settlements WHERE trip_id = ? GROUP BY from_user', tripId)) {
    add(r.uid, 'sentCents', r.c);
  }
  for (const r of all('SELECT to_user AS uid, SUM(amount_cents) AS c FROM settlements WHERE trip_id = ? GROUP BY to_user', tripId)) {
    add(r.uid, 'receivedCents', r.c);
  }

  const balances = [...byId.values()];
  for (const b of balances) {
    b.netCents = b.paidCents - b.shareCents + b.sentCents - b.receivedCents;
  }

  return { balances, suggestions: simplifyDebts(balances) };
}

/** Greedy settle-up plan: largest debtor pays largest creditor until everyone is even. */
export function simplifyDebts(balances) {
  const names = new Map(balances.map((b) => [b.userId, b.name]));
  const creditors = balances.filter((b) => b.netCents > 0).map((b) => ({ id: b.userId, amt: b.netCents }));
  const debtors = balances.filter((b) => b.netCents < 0).map((b) => ({ id: b.userId, amt: -b.netCents }));
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const plan = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amt, creditors[j].amt);
    plan.push({
      from: { id: debtors[i].id, name: names.get(debtors[i].id) },
      to: { id: creditors[j].id, name: names.get(creditors[j].id) },
      amountCents: amount,
    });
    debtors[i].amt -= amount;
    creditors[j].amt -= amount;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return plan;
}

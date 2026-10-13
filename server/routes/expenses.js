import { Router } from 'express';
import { all, get, run, transaction } from '../db.js';
import { amountToCents, date, fail, id, text } from '../http.js';
import { computeSplits } from '../ledger.js';

const router = Router();

function memberIdSet(tripId) {
  return new Set(all('SELECT user_id FROM trip_members WHERE trip_id = ?', tripId).map((r) => r.user_id));
}

function readExpense(body, tripId) {
  const memberIds = memberIdSet(tripId);
  const amountCents = amountToCents(body.amount);
  const paidBy = id(body.paidBy, 'Payer');
  if (!memberIds.has(paidBy)) fail(400, 'The payer must be a member of this trip');
  const splitType = body.splitType;
  const parts = computeSplits({ amountCents, splitType, splits: body.splits, memberIds });
  return {
    description: text(body.description, 'Description', { max: 120 }),
    amountCents,
    category: text(body.category, 'Category', { max: 40, optional: true }) ?? 'Other',
    paidBy,
    splitType,
    date: date(body.date, 'Date'),
    notes: text(body.notes, 'Notes', { max: 1000, optional: true }),
    parts,
  };
}

function saveSplits(expenseId, parts) {
  run('DELETE FROM expense_splits WHERE expense_id = ?', expenseId);
  for (const p of parts) {
    run(
      'INSERT INTO expense_splits (expense_id, user_id, amount_cents, share_value) VALUES (?, ?, ?, ?)',
      expenseId, p.userId, p.cents, p.value,
    );
  }
}

function loadExpenses(tripId, expenseId = null) {
  const filter = expenseId ? 'AND e.id = ?' : '';
  const params = expenseId ? [tripId, expenseId] : [tripId];
  const rows = all(
    `SELECT e.*, u.name AS payer_name
       FROM expenses e JOIN users u ON u.id = e.paid_by
      WHERE e.trip_id = ? ${filter}
      ORDER BY e.expense_date DESC, e.id DESC`,
    ...params,
  );
  const splits = all(
    `SELECT s.expense_id, s.user_id, s.amount_cents, s.share_value, u.name
       FROM expense_splits s
       JOIN expenses e ON e.id = s.expense_id
       JOIN users u ON u.id = s.user_id
      WHERE e.trip_id = ? ${filter}
      ORDER BY s.amount_cents DESC`,
    ...params,
  );
  const byExpense = new Map(rows.map((r) => [r.id, { ...r, splits: [] }]));
  for (const s of splits) {
    const { expense_id: expenseKey, ...rest } = s;
    byExpense.get(expenseKey)?.splits.push(rest);
  }
  return [...byExpense.values()];
}

function findExpense(req) {
  const expenseId = id(req.params.expenseId, 'Expense');
  const exists = get('SELECT id FROM expenses WHERE id = ? AND trip_id = ?', expenseId, req.tripId);
  if (!exists) fail(404, 'Expense not found');
  return expenseId;
}

router.get('/', (req, res) => {
  res.json({ expenses: loadExpenses(req.tripId) });
});

router.post('/', (req, res) => {
  const e = readExpense(req.body, req.tripId);
  const expenseId = transaction(() => {
    const { lastInsertRowid } = run(
      `INSERT INTO expenses (trip_id, description, amount_cents, category, paid_by, split_type, expense_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.tripId, e.description, e.amountCents, e.category, e.paidBy, e.splitType, e.date, e.notes, req.user.id,
    );
    saveSplits(Number(lastInsertRowid), e.parts);
    return Number(lastInsertRowid);
  });
  res.status(201).json({ expense: loadExpenses(req.tripId, expenseId)[0] });
});

router.put('/:expenseId', (req, res) => {
  const expenseId = findExpense(req);
  const e = readExpense(req.body, req.tripId);
  transaction(() => {
    run(
      `UPDATE expenses
          SET description = ?, amount_cents = ?, category = ?, paid_by = ?, split_type = ?,
              expense_date = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?`,
      e.description, e.amountCents, e.category, e.paidBy, e.splitType, e.date, e.notes, expenseId,
    );
    saveSplits(expenseId, e.parts);
  });
  res.json({ expense: loadExpenses(req.tripId, expenseId)[0] });
});

router.delete('/:expenseId', (req, res) => {
  const expenseId = findExpense(req);
  run('DELETE FROM expenses WHERE id = ?', expenseId);
  res.status(204).end();
});

export default router;

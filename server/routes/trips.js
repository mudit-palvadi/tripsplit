import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { UPLOAD_DIR, all, get, run, transaction } from '../db.js';
import { date, fail, id, text } from '../http.js';
import { requireTripMember, requireTripOwner } from '../auth.js';
import { computeBalances } from '../ledger.js';
import expenses from './expenses.js';
import settlements from './settlements.js';
import analytics from './analytics.js';
import notes from './notes.js';
import documents from './documents.js';

const CURRENCY_RE = /^[A-Z]{3}$/;

function readTripFields(body, existing = {}) {
  const fields = {
    name: text(body.name ?? existing.name, 'Trip name', { max: 80 }),
    description: text(body.description ?? existing.description, 'Description', { max: 500, optional: true }),
    currency: (body.currency ?? existing.currency ?? 'INR').toString().toUpperCase(),
    start_date: date(body.startDate === undefined ? existing.start_date : body.startDate, 'Start date', { optional: true }),
    end_date: date(body.endDate === undefined ? existing.end_date : body.endDate, 'End date', { optional: true }),
  };
  if (!CURRENCY_RE.test(fields.currency)) fail(400, 'Currency must be a 3-letter code like INR or USD');
  if (fields.start_date && fields.end_date && fields.end_date < fields.start_date) {
    fail(400, 'End date cannot be before the start date');
  }
  return fields;
}

function tripMembers(tripId) {
  return all(
    `SELECT u.id, u.name, u.email, tm.role, tm.joined_at
       FROM trip_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.trip_id = ?
      ORDER BY tm.role = 'owner' DESC, tm.joined_at, u.id`,
    tripId,
  );
}

function tripSummary(tripId, userId) {
  const totals = get(
    'SELECT COALESCE(SUM(amount_cents), 0) AS totalCents, COUNT(*) AS expenseCount FROM expenses WHERE trip_id = ?',
    tripId,
  );
  const mine = computeBalances(tripId).balances.find((b) => b.userId === userId);
  return { ...totals, myNetCents: mine?.netCents ?? 0, myShareCents: mine?.shareCents ?? 0 };
}

const router = Router();

router.get('/', (req, res) => {
  const trips = all(
    `SELECT t.*, tm.role
       FROM trips t JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = ?
      ORDER BY COALESCE(t.start_date, substr(t.created_at, 1, 10)) DESC, t.id DESC`,
    req.user.id,
  );
  res.json({
    trips: trips.map((t) => ({
      ...t,
      members: tripMembers(t.id).map(({ id: memberId, name }) => ({ id: memberId, name })),
      summary: tripSummary(t.id, req.user.id),
    })),
  });
});

router.post('/', (req, res) => {
  const f = readTripFields(req.body);
  const tripId = transaction(() => {
    const { lastInsertRowid } = run(
      'INSERT INTO trips (name, description, currency, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      f.name, f.description, f.currency, f.start_date, f.end_date, req.user.id,
    );
    run("INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')", lastInsertRowid, req.user.id);
    return Number(lastInsertRowid);
  });
  res.status(201).json({ trip: get('SELECT * FROM trips WHERE id = ?', tripId) });
});

const trip = Router({ mergeParams: true });
trip.use(requireTripMember);

trip.get('/', (req, res) => {
  res.json({
    trip: get('SELECT * FROM trips WHERE id = ?', req.tripId),
    role: req.tripRole,
    members: tripMembers(req.tripId),
    summary: tripSummary(req.tripId, req.user.id),
  });
});

trip.patch('/', requireTripOwner, (req, res) => {
  const existing = get('SELECT * FROM trips WHERE id = ?', req.tripId);
  const f = readTripFields(req.body, existing);
  run(
    'UPDATE trips SET name = ?, description = ?, currency = ?, start_date = ?, end_date = ? WHERE id = ?',
    f.name, f.description, f.currency, f.start_date, f.end_date, req.tripId,
  );
  res.json({ trip: get('SELECT * FROM trips WHERE id = ?', req.tripId) });
});

trip.delete('/', requireTripOwner, (req, res) => {
  const files = all('SELECT stored_name FROM documents WHERE trip_id = ?', req.tripId);
  run('DELETE FROM trips WHERE id = ?', req.tripId);
  for (const f of files) fs.rm(path.join(UPLOAD_DIR, f.stored_name), { force: true }, () => {});
  res.status(204).end();
});

trip.post('/members', (req, res) => {
  const email = text(req.body.email, 'Email', { max: 120 }).toLowerCase();
  const user = get('SELECT id, name, email FROM users WHERE email = ?', email);
  if (!user) fail(404, 'No account uses that email yet. Ask them to sign up first, then add them.');
  if (get('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?', req.tripId, user.id)) {
    fail(409, `${user.name} is already in this trip`);
  }
  run("INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'member')", req.tripId, user.id);
  res.status(201).json({ members: tripMembers(req.tripId) });
});

trip.delete('/members/:userId', (req, res) => {
  const userId = id(req.params.userId, 'User');
  const target = get(
    'SELECT tm.role, u.name FROM trip_members tm JOIN users u ON u.id = tm.user_id WHERE tm.trip_id = ? AND tm.user_id = ?',
    req.tripId,
    userId,
  );
  if (!target) fail(404, 'That person is not in this trip');
  if (target.role === 'owner') fail(400, 'The trip owner cannot be removed');
  if (userId !== req.user.id && req.tripRole !== 'owner') fail(403, 'Only the trip owner can remove other members');

  const involved = get(
    `SELECT 1 FROM expenses WHERE trip_id = ? AND paid_by = ?
     UNION SELECT 1 FROM expense_splits s JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ? AND s.user_id = ?
     UNION SELECT 1 FROM settlements WHERE trip_id = ? AND (from_user = ? OR to_user = ?)
     LIMIT 1`,
    req.tripId, userId, req.tripId, userId, req.tripId, userId, userId,
  );
  if (involved) {
    fail(400, `${target.name} is part of expenses or payments in this trip. Remove those first.`);
  }
  run('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?', req.tripId, userId);
  res.json({ members: tripMembers(req.tripId) });
});

trip.get('/balances', (req, res) => {
  res.json(computeBalances(req.tripId));
});

trip.use('/expenses', expenses);
trip.use('/settlements', settlements);
trip.use('/analytics', analytics);
trip.use('/notes', notes);
trip.use('/documents', documents);

router.use('/:tripId(\\d+)', trip);

export default router;

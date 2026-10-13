import { Router } from 'express';
import { all, get, run } from '../db.js';
import { amountToCents, date, fail, id, text } from '../http.js';

const router = Router();

const SELECT_SETTLEMENTS = `
  SELECT s.*, f.name AS from_name, t.name AS to_name
    FROM settlements s
    JOIN users f ON f.id = s.from_user
    JOIN users t ON t.id = s.to_user
   WHERE s.trip_id = ?`;

router.get('/', (req, res) => {
  res.json({ settlements: all(`${SELECT_SETTLEMENTS} ORDER BY s.settled_on DESC, s.id DESC`, req.tripId) });
});

router.post('/', (req, res) => {
  const fromUser = id(req.body.fromUserId, 'Payer');
  const toUser = id(req.body.toUserId, 'Recipient');
  if (fromUser === toUser) fail(400, 'Payer and recipient must be different people');
  const isMember = (userId) => get('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?', req.tripId, userId);
  if (!isMember(fromUser) || !isMember(toUser)) fail(400, 'Both people must be members of this trip');

  const amountCents = amountToCents(req.body.amount);
  const settledOn = date(req.body.date, 'Date');
  const note = text(req.body.note, 'Note', { max: 200, optional: true });

  const { lastInsertRowid } = run(
    `INSERT INTO settlements (trip_id, from_user, to_user, amount_cents, note, settled_on, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    req.tripId, fromUser, toUser, amountCents, note, settledOn, req.user.id,
  );
  res.status(201).json({ settlement: get(`${SELECT_SETTLEMENTS} AND s.id = ?`, req.tripId, lastInsertRowid) });
});

router.delete('/:settlementId', (req, res) => {
  const settlementId = id(req.params.settlementId, 'Payment');
  const { changes } = run('DELETE FROM settlements WHERE id = ? AND trip_id = ?', settlementId, req.tripId);
  if (!changes) fail(404, 'Payment not found');
  res.status(204).end();
});

export default router;

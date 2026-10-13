import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { DATA_DIR, get } from './db.js';

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, 'jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret);
  return secret;
}

const SECRET = loadSecret();

export function signToken(user) {
  return jwt.sign({ uid: user.id }, SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { uid } = jwt.verify(token, SECRET);
    const user = get('SELECT id, name, email FROM users WHERE id = ?', uid);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

export function requireTripMember(req, res, next) {
  const tripId = Number(req.params.tripId);
  const membership = get(
    'SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?',
    tripId,
    req.user.id,
  );
  if (!membership) return res.status(404).json({ error: 'Trip not found' });
  req.tripId = tripId;
  req.tripRole = membership.role;
  next();
}

export function requireTripOwner(req, res, next) {
  if (req.tripRole !== 'owner') {
    return res.status(403).json({ error: 'Only the trip owner can do that' });
  }
  next();
}

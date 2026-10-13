import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, run } from '../db.js';
import { fail, text } from '../http.js';
import { requireAuth, signToken } from '../auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', (req, res) => {
  const name = text(req.body.name, 'Name', { max: 60 });
  const email = text(req.body.email, 'Email', { max: 120 }).toLowerCase();
  const { password } = req.body;
  if (!EMAIL_RE.test(email)) fail(400, 'Enter a valid email address');
  if (typeof password !== 'string' || password.length < 6) fail(400, 'Password must be at least 6 characters');
  if (get('SELECT id FROM users WHERE email = ?', email)) fail(409, 'An account with this email already exists');

  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', name, email, hash);
  const user = { id: Number(lastInsertRowid), name, email };
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', (req, res) => {
  const email = text(req.body.email, 'Email', { max: 120 }).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const row = get('SELECT id, name, email, password_hash FROM users WHERE email = ?', email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) fail(401, 'Incorrect email or password');
  const user = { id: row.id, name: row.name, email: row.email };
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;

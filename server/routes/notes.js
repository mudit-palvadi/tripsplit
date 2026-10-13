import { Router } from 'express';
import { all, get, run } from '../db.js';
import { fail, id, text } from '../http.js';

const router = Router();

const SELECT_NOTES = `
  SELECT n.*, u.name AS author_name
    FROM notes n JOIN users u ON u.id = n.created_by
   WHERE n.trip_id = ?`;

function readNote(body) {
  if (typeof body.content === 'string' && body.content.length > 20000) fail(400, 'Note is too long (max 20,000 characters)');
  return {
    title: text(body.title, 'Title', { max: 120 }),
    content: typeof body.content === 'string' ? body.content : '',
    pinned: body.pinned ? 1 : 0,
  };
}

function findNote(req) {
  const noteId = id(req.params.noteId, 'Note');
  const note = get('SELECT * FROM notes WHERE id = ? AND trip_id = ?', noteId, req.tripId);
  if (!note) fail(404, 'Note not found');
  return note;
}

router.get('/', (req, res) => {
  res.json({ notes: all(`${SELECT_NOTES} ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC`, req.tripId) });
});

router.post('/', (req, res) => {
  const n = readNote(req.body);
  const { lastInsertRowid } = run(
    'INSERT INTO notes (trip_id, title, content, pinned, created_by) VALUES (?, ?, ?, ?, ?)',
    req.tripId, n.title, n.content, n.pinned, req.user.id,
  );
  res.status(201).json({ note: get(`${SELECT_NOTES} AND n.id = ?`, req.tripId, lastInsertRowid) });
});

router.put('/:noteId', (req, res) => {
  const note = findNote(req);
  const n = readNote(req.body);
  run(
    "UPDATE notes SET title = ?, content = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?",
    n.title, n.content, n.pinned, note.id,
  );
  res.json({ note: get(`${SELECT_NOTES} AND n.id = ?`, req.tripId, note.id) });
});

router.delete('/:noteId', (req, res) => {
  const note = findNote(req);
  if (note.created_by !== req.user.id && req.tripRole !== 'owner') {
    fail(403, 'Only the author or the trip owner can delete this note');
  }
  run('DELETE FROM notes WHERE id = ?', note.id);
  res.status(204).end();
});

export default router;

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { UPLOAD_DIR, all, get, run } from '../db.js';
import { HttpError, fail, id, text } from '../http.js';

const MAX_FILE_MB = 15;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
});

function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${MAX_FILE_MB} MB)` : err.message;
    next(new HttpError(400, message));
  });
}

// Busboy decodes multipart filenames as latin1; recover UTF-8 names when that is what the browser sent.
function decodeFilename(name) {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('\uFFFD') ? name : utf8;
}

const SELECT_DOCS = `
  SELECT d.id, d.original_name, d.mime_type, d.size, d.description, d.uploaded_by, d.uploaded_at,
         u.name AS uploader_name
    FROM documents d JOIN users u ON u.id = d.uploaded_by
   WHERE d.trip_id = ?`;

function findDocument(req) {
  const docId = id(req.params.docId, 'Document');
  const doc = get('SELECT * FROM documents WHERE id = ? AND trip_id = ?', docId, req.tripId);
  if (!doc) fail(404, 'Document not found');
  return doc;
}

const router = Router();

router.get('/', (req, res) => {
  res.json({ documents: all(`${SELECT_DOCS} ORDER BY d.uploaded_at DESC, d.id DESC`, req.tripId) });
});

router.post('/', receiveFile, (req, res) => {
  if (!req.file) fail(400, 'Choose a file to upload');
  let description;
  try {
    description = text(req.body.description, 'Description', { max: 200, optional: true });
  } catch (err) {
    fs.rm(req.file.path, { force: true }, () => {});
    throw err;
  }
  const { lastInsertRowid } = run(
    `INSERT INTO documents (trip_id, original_name, stored_name, mime_type, size, description, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    req.tripId,
    decodeFilename(req.file.originalname).slice(0, 200),
    req.file.filename,
    req.file.mimetype,
    req.file.size,
    description,
    req.user.id,
  );
  res.status(201).json({ document: get(`${SELECT_DOCS} AND d.id = ?`, req.tripId, lastInsertRowid) });
});

router.get('/:docId/download', (req, res, next) => {
  const doc = findDocument(req);
  const filePath = path.join(UPLOAD_DIR, doc.stored_name);
  if (!fs.existsSync(filePath)) fail(410, 'The file for this document is missing on the server');
  res.download(filePath, doc.original_name, { headers: { 'Content-Type': doc.mime_type || 'application/octet-stream' } }, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

router.delete('/:docId', (req, res) => {
  const doc = findDocument(req);
  if (doc.uploaded_by !== req.user.id && req.tripRole !== 'owner') {
    fail(403, 'Only the uploader or the trip owner can delete this document');
  }
  run('DELETE FROM documents WHERE id = ?', doc.id);
  fs.rm(path.join(UPLOAD_DIR, doc.stored_name), { force: true }, () => {});
  res.status(204).end();
});

export default router;

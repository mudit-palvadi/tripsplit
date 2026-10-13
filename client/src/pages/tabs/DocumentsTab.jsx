import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fetchFile } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { EmptyState, ErrorBanner, Loading } from '../../components/ui.jsx';
import { formatBytes, formatDateTime } from '../../utils.js';

const MAX_MB = 15;

function fileKind(doc) {
  const mime = doc.mime_type || '';
  const ext = doc.original_name.split('.').pop().toLowerCase();
  if (mime.startsWith('image/')) return { label: 'IMG', color: '#8b5cf6', previewable: true };
  if (mime === 'application/pdf' || ext === 'pdf') return { label: 'PDF', color: '#dc2626', previewable: true };
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return { label: 'DOC', color: '#2563eb' };
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return { label: 'XLS', color: '#16a34a' };
  if (mime.startsWith('text/')) return { label: 'TXT', color: '#64748b', previewable: true };
  return { label: ext.slice(0, 4).toUpperCase() || 'FILE', color: '#475569' };
}

export default function DocumentsTab({ trip, role }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(
    () =>
      api(`/trips/${trip.id}/documents`)
        .then((d) => setDocs(d.documents))
        .catch((e) => setError(e.message)),
    [trip.id],
  );

  useEffect(() => {
    load();
  }, [load]);

  function pick(f) {
    setError('');
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(`"${f.name}" is larger than ${MAX_MB} MB`);
      return;
    }
    setFile(f ?? null);
  }

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('description', description);
    try {
      await api(`/trips/${trip.id}/documents`, { method: 'POST', form });
      setFile(null);
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
      load();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function open(doc, download) {
    try {
      await fetchFile(`/trips/${trip.id}/documents/${doc.id}/download`, doc.original_name, { open: !download });
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Delete "${doc.original_name}"?`)) return;
    try {
      await api(`/trips/${trip.id}/documents/${doc.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!docs) return error ? <ErrorBanner message={error} /> : <Loading />;

  return (
    <div>
      <ErrorBanner message={error} />
      <form className="card upload-card" onSubmit={upload}>
        <div
          className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
        >
          <input ref={inputRef} type="file" hidden onChange={(e) => pick(e.target.files[0])} />
          {file ? (
            <span>
              <strong>{file.name}</strong> · {formatBytes(file.size)}
            </span>
          ) : (
            <span>
              <strong>Drop a file here</strong> or click to browse
              <br />
              <span className="muted small">Tickets, bookings, IDs, receipts… up to {MAX_MB} MB</span>
            </span>
          )}
        </div>
        <div className="inline-form">
          <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          <button className="btn btn-primary" disabled={!file || busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>

      {docs.length === 0 ? (
        <EmptyState title="No documents yet">Upload flight tickets, hotel bookings, visas or receipts so everyone has them.</EmptyState>
      ) : (
        <div className="card card-flush">
          {docs.map((d) => {
            const kind = fileKind(d);
            return (
              <div key={d.id} className="doc-row">
                <span className="doc-icon" style={{ background: kind.color }}>
                  {kind.label}
                </span>
                <div className="doc-info">
                  <strong>{d.original_name}</strong>
                  {d.description && <span>{d.description}</span>}
                  <span className="muted small">
                    {formatBytes(d.size)} · {d.uploader_name} · {formatDateTime(d.uploaded_at)}
                  </span>
                </div>
                <div className="row-actions">
                  {kind.previewable && (
                    <button className="btn btn-ghost btn-sm" onClick={() => open(d, false)}>
                      View
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => open(d, true)}>
                    Download
                  </button>
                  {(d.uploaded_by === user.id || role === 'owner') && (
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(d)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { EmptyState, ErrorBanner, Loading, Modal } from '../../components/ui.jsx';
import { formatDateTime } from '../../utils.js';

function NoteForm({ trip, note, onSaved, onCancel }) {
  const [form, setForm] = useState({ title: note?.title ?? '', content: note?.content ?? '', pinned: Boolean(note?.pinned) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const path = note ? `/trips/${trip.id}/notes/${note.id}` : `/trips/${trip.id}/notes`;
      await api(path, { method: note ? 'PUT' : 'POST', body: form });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ErrorBanner message={error} />
      <label className="field">
        <span>Title</span>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} autoFocus placeholder="Packing list" />
      </label>
      <label className="field">
        <span>Note</span>
        <textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write anything: itinerary, packing list, hotel check-in codes…" />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
        Pin to top
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : note ? 'Save note' : 'Add note'}
        </button>
      </div>
    </form>
  );
}

export default function NotesTab({ trip, role }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(
    () =>
      api(`/trips/${trip.id}/notes`)
        .then((d) => setNotes(d.notes))
        .catch((e) => setError(e.message)),
    [trip.id],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function togglePin(note) {
    try {
      await api(`/trips/${trip.id}/notes/${note.id}`, { method: 'PUT', body: { ...note, pinned: !note.pinned } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(note) {
    if (!window.confirm(`Delete the note "${note.title}"?`)) return;
    try {
      await api(`/trips/${trip.id}/notes/${note.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!notes) return error ? <ErrorBanner message={error} /> : <Loading />;

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="toolbar toolbar-end">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + New note
        </button>
      </div>

      {notes.length === 0 ? (
        <EmptyState title="No notes yet">Keep the itinerary, packing lists, addresses or booking codes here for everyone.</EmptyState>
      ) : (
        <div className="notes-grid">
          {notes.map((n) => (
            <article key={n.id} className={`card note ${n.pinned ? 'note-pinned' : ''}`}>
              <div className="note-header">
                <h3>{n.title}</h3>
                <button className="icon-btn" title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(n)}>
                  {n.pinned ? '★' : '☆'}
                </button>
              </div>
              <p className="note-content">{n.content || <span className="muted">Empty note</span>}</p>
              <div className="note-footer">
                <span className="muted small">
                  {n.author_name} · {formatDateTime(n.updated_at)}
                </span>
                <span className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(n)}>
                    Edit
                  </button>
                  {(n.created_by === user.id || role === 'owner') && (
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(n)}>
                      Delete
                    </button>
                  )}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New note' : 'Edit note'} onClose={() => setEditing(null)} wide>
          <NoteForm
            trip={trip}
            note={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

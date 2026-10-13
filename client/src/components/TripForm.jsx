import { useState } from 'react';
import { api } from '../api.js';
import { CURRENCIES } from '../utils.js';
import { ErrorBanner } from './ui.jsx';

export default function TripForm({ trip, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: trip?.name ?? '',
    description: trip?.description ?? '',
    currency: trip?.currency ?? 'INR',
    startDate: trip?.start_date ?? '',
    endDate: trip?.end_date ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, startDate: form.startDate || null, endDate: form.endDate || null };
      const data = trip
        ? await api(`/trips/${trip.id}`, { method: 'PATCH', body })
        : await api('/trips', { method: 'POST', body });
      onSaved(data.trip);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <ErrorBanner message={error} />
      <label className="field">
        <span>Trip name</span>
        <input value={form.name} onChange={set('name')} required maxLength={80} autoFocus placeholder="Goa with the gang" />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea value={form.description} onChange={set('description')} rows={2} maxLength={500} placeholder="Optional" />
      </label>
      <div className="row">
        <label className="field">
          <span>Currency</span>
          <select value={form.currency} onChange={set('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Start date</span>
          <input type="date" value={form.startDate} onChange={set('startDate')} />
        </label>
        <label className="field">
          <span>End date</span>
          <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={set('endDate')} />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : trip ? 'Save changes' : 'Create trip'}
        </button>
      </div>
    </form>
  );
}

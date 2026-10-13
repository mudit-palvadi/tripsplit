import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, EmptyState, ErrorBanner, Loading, Modal, NetAmount } from '../../components/ui.jsx';
import { formatDate, formatMoney, todayISO } from '../../utils.js';

function SettlementForm({ trip, members, initial, onSaved, onCancel }) {
  const [form, setForm] = useState({
    fromUserId: initial?.from ?? members[0]?.id,
    toUserId: initial?.to ?? members[1]?.id,
    amount: initial ? (initial.amountCents / 100).toFixed(2) : '',
    date: todayISO(),
    note: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/trips/${trip.id}/settlements`, {
        method: 'POST',
        body: { ...form, fromUserId: Number(form.fromUserId), toUserId: Number(form.toUserId), amount: Number(form.amount) },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ErrorBanner message={error} />
      <div className="row">
        <label className="field">
          <span>Who paid</span>
          <select value={form.fromUserId} onChange={set('fromUserId')}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Paid to</span>
          <select value={form.toUserId} onChange={set('toUserId')}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Amount ({trip.currency})</span>
          <input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={form.date} onChange={set('date')} required />
        </label>
      </div>
      <label className="field">
        <span>Note</span>
        <input value={form.note} onChange={set('note')} maxLength={200} placeholder="e.g. UPI transfer" />
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </form>
  );
}

export default function BalancesTab({ trip, members, onChanged }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(null);

  const load = useCallback(() => {
    Promise.all([api(`/trips/${trip.id}/balances`), api(`/trips/${trip.id}/settlements`)])
      .then(([b, s]) => {
        setData(b);
        setSettlements(s.settlements);
      })
      .catch((e) => setError(e.message));
  }, [trip.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function removeSettlement(s) {
    if (!window.confirm('Delete this payment record?')) return;
    try {
      await api(`/trips/${trip.id}/settlements/${s.id}`, { method: 'DELETE' });
      load();
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!data) return error ? <ErrorBanner message={error} /> : <Loading />;

  const fmt = (c) => formatMoney(c, trip.currency);
  const maxAbs = Math.max(1, ...data.balances.map((b) => Math.abs(b.netCents)));
  const name = (id, n) => (id === user.id ? 'You' : n);

  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-header">
          <h3>Balances</h3>
        </div>
        <div className="balance-list">
          {data.balances.map((b) => (
            <div key={b.userId} className="balance-row">
              <Avatar user={{ id: b.userId, name: b.name }} size={32} />
              <div className="balance-info">
                <strong>{name(b.userId, b.name)}</strong>
                <span className="muted small">
                  paid {fmt(b.paidCents)} · share {fmt(b.shareCents)}
                </span>
              </div>
              <div className="balance-bar">
                <div className="balance-bar-track">
                  <div
                    className={`balance-bar-fill ${b.netCents >= 0 ? 'fill-pos' : 'fill-neg'}`}
                    style={{ width: `${(Math.abs(b.netCents) / maxAbs) * 50}%`, [b.netCents >= 0 ? 'left' : 'right']: '50%' }}
                  />
                </div>
                <NetAmount cents={b.netCents} currency={trip.currency} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3>Settle up</h3>
          {members.length > 1 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSettling({})}>
              Record a payment
            </button>
          )}
        </div>
        {data.suggestions.length === 0 ? (
          <EmptyState title="Everyone is settled up">No payments are needed right now.</EmptyState>
        ) : (
          <>
            <p className="muted small">The fewest payments needed to settle everyone:</p>
            <ul className="suggestions">
              {data.suggestions.map((s, i) => (
                <li key={i} className={s.from.id === user.id || s.to.id === user.id ? 'suggestion-mine' : ''}>
                  <Avatar user={s.from} size={28} />
                  <span>
                    <strong>{name(s.from.id, s.from.name)}</strong> {s.from.id === user.id ? 'pay' : 'pays'}{' '}
                    <strong>{name(s.to.id, s.to.name)}</strong>
                  </span>
                  <strong className="suggestion-amount">{fmt(s.amountCents)}</strong>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setSettling({ from: s.from.id, to: s.to.id, amountCents: s.amountCents })}
                  >
                    Settle
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4 className="section-title">Payment history</h4>
        {settlements.length === 0 ? (
          <p className="muted small">No payments recorded yet.</p>
        ) : (
          <ul className="history">
            {settlements.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{name(s.from_user, s.from_name)}</strong> paid <strong>{name(s.to_user, s.to_name)}</strong>{' '}
                  {fmt(s.amount_cents)}
                  <div className="muted small">
                    {formatDate(s.settled_on)}
                    {s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
                <button className="icon-btn" title="Delete payment" onClick={() => removeSettlement(s)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settling && (
        <Modal title="Record a payment" onClose={() => setSettling(null)}>
          <SettlementForm
            trip={trip}
            members={members}
            initial={settling.from ? settling : null}
            onCancel={() => setSettling(null)}
            onSaved={() => {
              setSettling(null);
              load();
              onChanged();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { CATEGORIES, distribute, formatMoney, todayISO } from '../utils.js';
import { Avatar, ErrorBanner } from './ui.jsx';

const SPLIT_TYPES = [
  { id: 'equal', label: 'Equally' },
  { id: 'exact', label: 'Exact amounts' },
  { id: 'percent', label: 'Percentages' },
  { id: 'shares', label: 'Shares' },
];

function defaultValues(type, participantIds, amountCents) {
  const values = {};
  const n = participantIds.length;
  if (!n) return values;
  if (type === 'shares') {
    participantIds.forEach((id) => (values[id] = '1'));
  } else if (type === 'percent') {
    const parts = distribute(10000, participantIds.map((userId) => ({ userId, weight: 1 })));
    participantIds.forEach((id) => (values[id] = (parts.get(id) / 100).toString()));
  } else if (type === 'exact' && amountCents > 0) {
    const parts = distribute(amountCents, participantIds.map((userId) => ({ userId, weight: 1 })));
    participantIds.forEach((id) => (values[id] = (parts.get(id) / 100).toFixed(2)));
  }
  return values;
}

export default function ExpenseForm({ trip, members, expense, onSaved, onCancel }) {
  const { user } = useAuth();
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(expense ? (expense.amount_cents / 100).toString() : '');
  const [category, setCategory] = useState(expense?.category ?? CATEGORIES[0].name);
  const [date, setDate] = useState(expense?.expense_date ?? todayISO());
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? user.id);
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [splitType, setSplitType] = useState(expense?.split_type ?? 'equal');
  const [included, setIncluded] = useState(
    () => new Set(expense ? expense.splits.map((s) => s.user_id) : members.map((m) => m.id)),
  );
  const [values, setValues] = useState(() => {
    if (!expense) return {};
    return Object.fromEntries(
      expense.splits.map((s) => [s.user_id, expense.split_type === 'exact' ? (s.amount_cents / 100).toFixed(2) : String(s.share_value ?? '')]),
    );
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const amountCents = Math.round((parseFloat(amount) || 0) * 100);
  const participants = members.filter((m) => included.has(m.id));
  const fmt = (c) => formatMoney(c, trip.currency);

  const { preview, issue } = (() => {
    if (!participants.length) return { preview: new Map(), issue: 'Select at least one person' };
    const num = (id) => parseFloat(values[id]) || 0;
    if (splitType === 'equal') {
      return { preview: distribute(amountCents, participants.map((p) => ({ userId: p.id, weight: 1 }))), issue: null };
    }
    if (splitType === 'exact') {
      const map = new Map(participants.map((p) => [p.id, Math.round(num(p.id) * 100)]));
      const diff = amountCents - [...map.values()].reduce((s, c) => s + c, 0);
      const msg = diff > 0 ? `${fmt(diff)} left to assign` : `${fmt(-diff)} over the total`;
      return { preview: map, issue: diff === 0 ? null : msg };
    }
    const weights = participants.map((p) => ({ userId: p.id, weight: num(p.id) }));
    const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
    if (splitType === 'percent') {
      const left = Math.round((100 - totalWeight) * 100) / 100;
      const msg = left > 0 ? `${left}% left to assign` : `${-left}% over 100%`;
      return { preview: distribute(amountCents, weights), issue: Math.abs(left) > 0.01 ? msg : null };
    }
    return { preview: distribute(amountCents, weights), issue: totalWeight > 0 ? null : 'Give at least one person a share' };
  })();

  function toggle(id) {
    const next = new Set(included);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (splitType === 'shares' && !values[id]) setValues({ ...values, [id]: '1' });
    }
    setIncluded(next);
  }

  function changeType(type) {
    setSplitType(type);
    setValues(defaultValues(type, participants.map((p) => p.id), amountCents));
  }

  async function submit(e) {
    e.preventDefault();
    if (issue) return setError(issue);
    setBusy(true);
    setError('');
    const body = {
      description,
      amount: Number(amount),
      category,
      date,
      paidBy: Number(paidBy),
      notes,
      splitType,
      splits: participants.map((p) => ({ userId: p.id, value: splitType === 'equal' ? null : parseFloat(values[p.id]) || 0 })),
    };
    try {
      const path = expense ? `/trips/${trip.id}/expenses/${expense.id}` : `/trips/${trip.id}/expenses`;
      await api(path, { method: expense ? 'PUT' : 'POST', body });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const unit = { exact: trip.currency, percent: '%', shares: 'shares' }[splitType];

  return (
    <form className="form" onSubmit={submit}>
      <ErrorBanner message={error} />
      <div className="row">
        <label className="field grow-2">
          <span>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={120} autoFocus placeholder="Dinner at the beach shack" />
        </label>
        <label className="field">
          <span>Amount ({trip.currency})</span>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Paid by</span>
          <select value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === user.id ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
            {!CATEGORIES.some((c) => c.name === category) && <option>{category}</option>}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>

      <div className="field">
        <span>Split</span>
        <div className="segmented">
          {SPLIT_TYPES.map((t) => (
            <button type="button" key={t.id} className={splitType === t.id ? 'active' : ''} onClick={() => changeType(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="split-list">
        {members.map((m) => {
          const on = included.has(m.id);
          return (
            <div key={m.id} className={`split-row ${on ? '' : 'split-row-off'}`}>
              <label className="split-person">
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} />
                <Avatar user={m} size={26} />
                <span>{m.id === user.id ? `${m.name} (you)` : m.name}</span>
              </label>
              {splitType !== 'equal' && on && (
                <div className="split-input">
                  <input
                    type="number"
                    min="0"
                    step={splitType === 'shares' ? '0.5' : '0.01'}
                    value={values[m.id] ?? ''}
                    onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                    placeholder="0"
                  />
                  <span className="muted small">{unit}</span>
                </div>
              )}
              <span className="split-amount">{on ? fmt(preview.get(m.id) ?? 0) : '—'}</span>
            </div>
          );
        })}
      </div>
      <div className={`split-status ${issue ? 'neg' : 'pos'}`}>
        {issue ?? `Split between ${participants.length} ${participants.length === 1 ? 'person' : 'people'} · ${fmt(amountCents)}`}
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Optional" />
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    </form>
  );
}

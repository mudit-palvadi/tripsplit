import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import ExpenseForm from '../../components/ExpenseForm.jsx';
import { Avatar, EmptyState, ErrorBanner, Loading, Modal } from '../../components/ui.jsx';
import { CATEGORIES, categoryColor, formatDate, formatMoney } from '../../utils.js';

const SPLIT_LABEL = { equal: 'split equally', exact: 'exact amounts', percent: 'by percentage', shares: 'by shares' };

function ExpenseRow({ expense: e, trip, onEdit, onDelete }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const fmt = (c) => formatMoney(c, trip.currency);
  const myShare = e.splits.find((s) => s.user_id === user.id)?.amount_cents ?? 0;

  let impact;
  if (e.paid_by === user.id) {
    const lent = e.amount_cents - myShare;
    impact = lent > 0 ? <span className="pos">you lent {fmt(lent)}</span> : <span className="muted">just you</span>;
  } else if (myShare) {
    impact = <span className="neg">you owe {fmt(myShare)}</span>;
  } else {
    impact = <span className="muted">not involved</span>;
  }

  return (
    <div className={`expense ${open ? 'expense-open' : ''}`}>
      <button className="expense-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="cat-badge" style={{ background: categoryColor(e.category) }} title={e.category}>
          {e.category.slice(0, 1)}
        </span>
        <span className="expense-info">
          <strong>{e.description}</strong>
          <span className="muted small">
            {e.payer_name} paid · {e.category}
          </span>
        </span>
        <span className="expense-amounts">
          <strong>{fmt(e.amount_cents)}</strong>
          <span className="small">{impact}</span>
        </span>
      </button>
      {open && (
        <div className="expense-detail">
          <p className="muted small">
            {formatDate(e.expense_date)} · {SPLIT_LABEL[e.split_type]}
          </p>
          <ul className="split-breakdown">
            {e.splits.map((s) => (
              <li key={s.user_id}>
                <Avatar user={{ id: s.user_id, name: s.name }} size={22} />
                <span>{s.user_id === user.id ? 'You' : s.name}</span>
                {e.split_type === 'percent' && <span className="muted small">{s.share_value}%</span>}
                {e.split_type === 'shares' && <span className="muted small">{s.share_value} share(s)</span>}
                <span className="split-amount">{fmt(s.amount_cents)}</span>
              </li>
            ))}
          </ul>
          {e.notes && <p className="expense-notes">{e.notes}</p>}
          <div className="row-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(e)}>
              Edit
            </button>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => onDelete(e)}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExpensesTab({ trip, members, onChanged }) {
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [payer, setPayer] = useState('');

  const load = useCallback(
    () =>
      api(`/trips/${trip.id}/expenses`)
        .then((d) => setExpenses(d.expenses))
        .catch((e) => setError(e.message)),
    [trip.id],
  );

  useEffect(() => {
    load();
  }, [load]);

  function saved() {
    setEditing(null);
    load();
    onChanged();
  }

  async function remove(expense) {
    if (!window.confirm(`Delete "${expense.description}"?`)) return;
    try {
      await api(`/trips/${trip.id}/expenses/${expense.id}`, { method: 'DELETE' });
      load();
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!expenses) return error ? <ErrorBanner message={error} /> : <Loading />;

  const q = query.trim().toLowerCase();
  const filtered = expenses.filter(
    (e) =>
      (!q || e.description.toLowerCase().includes(q) || (e.notes ?? '').toLowerCase().includes(q)) &&
      (!category || e.category === category) &&
      (!payer || e.paid_by === Number(payer)),
  );
  const groups = [];
  for (const e of filtered) {
    const last = groups.at(-1);
    if (last?.date === e.expense_date) last.items.push(e);
    else groups.push({ date: e.expense_date, items: [e] });
  }
  const filteredTotal = filtered.reduce((s, e) => s + e.amount_cents, 0);

  return (
    <div>
      <ErrorBanner message={error} />
      <div className="toolbar">
        <input className="search" placeholder="Search expenses…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
        <select value={payer} onChange={(e) => setPayer(e.target.value)}>
          <option value="">Anyone paid</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + Add expense
        </button>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          action={
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              Add the first expense
            </button>
          }
        >
          {members.length < 2 ? 'Tip: add your travel buddies in the Members tab first.' : 'Log who paid for what and TripSplit works out who owes whom.'}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching expenses">Try a different search or filter.</EmptyState>
      ) : (
        <>
          {(q || category || payer) && (
            <p className="muted small">
              {filtered.length} matching expense{filtered.length === 1 ? '' : 's'} · {formatMoney(filteredTotal, trip.currency)}
            </p>
          )}
          {groups.map((g) => (
            <section key={g.date} className="expense-group">
              <h4 className="group-date">{formatDate(g.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</h4>
              <div className="card card-flush">
                {g.items.map((e) => (
                  <ExpenseRow key={e.id} expense={e} trip={trip} onEdit={setEditing} onDelete={remove} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add expense' : 'Edit expense'} onClose={() => setEditing(null)} wide>
          <ExpenseForm
            trip={trip}
            members={members}
            expense={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={saved}
          />
        </Modal>
      )}
    </div>
  );
}

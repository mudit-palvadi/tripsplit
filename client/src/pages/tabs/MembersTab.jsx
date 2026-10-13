import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, ErrorBanner } from '../../components/ui.jsx';
import { formatDate } from '../../utils.js';

export default function MembersTab({ trip, members, role, onChanged }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/trips/${trip.id}/members`, { method: 'POST', body: { email } });
      setNotice(`Added ${email} to the trip.`);
      setEmail('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function remove(member) {
    const self = member.id === user.id;
    const prompt = self ? `Leave "${trip.name}"?` : `Remove ${member.name} from this trip?`;
    if (!window.confirm(prompt)) return;
    setError('');
    setNotice('');
    try {
      await api(`/trips/${trip.id}/members/${member.id}`, { method: 'DELETE' });
      if (self) navigate('/');
      else onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-header">
          <h3>Members ({members.length})</h3>
        </div>
        <ErrorBanner message={error} />
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              <Avatar user={m} size={36} />
              <div className="member-info">
                <strong>
                  {m.name}
                  {m.id === user.id && ' (you)'}
                </strong>
                <span className="muted small">
                  {m.email} · joined {formatDate(m.joined_at)}
                </span>
              </div>
              {m.role === 'owner' ? (
                <span className="badge">Owner</span>
              ) : (
                (role === 'owner' || m.id === user.id) && (
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(m)}>
                    {m.id === user.id ? 'Leave' : 'Remove'}
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card-header">
          <h3>Add someone</h3>
        </div>
        <p className="muted small">
          Enter the email your friend signed up with. They'll see this trip on their dashboard right away.
        </p>
        {notice && <div className="alert alert-success">{notice}</div>}
        <form className="inline-form" onSubmit={add}>
          <input type="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
        <p className="muted small">
          Members who are part of any expense or payment can't be removed until those entries are edited or deleted, so
          balances always stay correct.
        </p>
      </section>
    </div>
  );
}

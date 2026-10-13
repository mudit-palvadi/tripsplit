import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import TripForm from '../components/TripForm.jsx';
import { AvatarStack, ErrorBanner, Loading, Modal, NetAmount } from '../components/ui.jsx';
import { formatDateRange, formatMoney } from '../utils.js';
import ExpensesTab from './tabs/ExpensesTab.jsx';
import BalancesTab from './tabs/BalancesTab.jsx';
import MembersTab from './tabs/MembersTab.jsx';
import NotesTab from './tabs/NotesTab.jsx';
import DocumentsTab from './tabs/DocumentsTab.jsx';

const AnalyticsTab = lazy(() => import('./tabs/AnalyticsTab.jsx'));

const TABS = [
  { id: 'expenses', label: 'Expenses', Component: ExpensesTab },
  { id: 'balances', label: 'Balances', Component: BalancesTab },
  { id: 'analytics', label: 'Analytics', Component: AnalyticsTab },
  { id: 'members', label: 'Members', Component: MembersTab },
  { id: 'notes', label: 'Notes', Component: NotesTab },
  { id: 'documents', label: 'Documents', Component: DocumentsTab },
];

export default function TripPage() {
  const { tripId, tab = 'expenses' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(
    () =>
      api(`/trips/${tripId}`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [tripId],
  );

  useEffect(() => {
    setData(null);
    setError('');
    refresh();
  }, [refresh]);

  if (error) {
    return (
      <>
        <ErrorBanner message={error} />
        <Link to="/">← Back to trips</Link>
      </>
    );
  }
  if (!data) return <Loading />;

  const { trip, members, role, summary } = data;
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const ActiveTab = active.Component;

  async function deleteTrip() {
    if (!window.confirm(`Delete "${trip.name}" with all its expenses, notes and documents? This cannot be undone.`)) return;
    try {
      await api(`/trips/${trip.id}`, { method: 'DELETE' });
      navigate('/');
    } catch (e) {
      window.alert(e.message);
    }
  }

  return (
    <>
      <Link to="/" className="back-link">
        ← All trips
      </Link>

      <section className="trip-header card">
        <div className="trip-header-main">
          <div>
            <h1>{trip.name}</h1>
            <p className="muted">
              {formatDateRange(trip.start_date, trip.end_date)} · {trip.currency}
            </p>
            {trip.description && <p className="trip-desc">{trip.description}</p>}
          </div>
          {role === 'owner' && (
            <div className="trip-header-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                Edit trip
              </button>
              <button className="btn btn-danger-ghost btn-sm" onClick={deleteTrip}>
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="trip-header-stats">
          <div>
            <span className="stat-label">Total spent</span>
            <strong>{formatMoney(summary.totalCents, trip.currency)}</strong>
          </div>
          <div>
            <span className="stat-label">Your share</span>
            <strong>{formatMoney(summary.myShareCents, trip.currency)}</strong>
          </div>
          <div>
            <span className="stat-label">Your balance</span>
            <strong>
              <NetAmount cents={summary.myNetCents} currency={trip.currency} />
            </strong>
          </div>
          <div>
            <span className="stat-label">{members.length} members</span>
            <AvatarStack users={members} max={6} />
          </div>
        </div>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.id}
            to={`/trips/${trip.id}/${t.id}`}
            className={() => `tab ${t.id === active.id ? 'tab-active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Suspense fallback={<Loading />}>
        <ActiveTab key={active.id} trip={trip} members={members} role={role} onChanged={refresh} />
      </Suspense>

      {editing && (
        <Modal title="Edit trip" onClose={() => setEditing(false)}>
          <TripForm
            trip={trip}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}

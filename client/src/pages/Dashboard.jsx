import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import TripForm from '../components/TripForm.jsx';
import { AvatarStack, EmptyState, ErrorBanner, Loading, Modal, NetAmount } from '../components/ui.jsx';
import { formatDateRange, formatMoney } from '../utils.js';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api('/trips')
      .then((d) => setTrips(d.trips))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!trips) return <Loading />;

  const owedToMe = trips.reduce((s, t) => s + Math.max(t.summary.myNetCents, 0), 0);
  const iOwe = trips.reduce((s, t) => s + Math.max(-t.summary.myNetCents, 0), 0);
  const currencies = new Set(trips.map((t) => t.currency));
  const singleCurrency = currencies.size === 1 ? [...currencies][0] : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hi {user.name.split(' ')[0]}</h1>
          <p className="muted">Your trips and where you stand in each.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + New trip
        </button>
      </div>

      {trips.length > 0 && singleCurrency && (
        <div className="stat-grid stat-grid-3">
          <div className="stat">
            <span className="stat-label">Trips</span>
            <span className="stat-value">{trips.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">You are owed</span>
            <span className={`stat-value ${owedToMe ? 'pos' : ''}`}>{formatMoney(owedToMe, singleCurrency)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">You owe</span>
            <span className={`stat-value ${iOwe ? 'neg' : ''}`}>{formatMoney(iOwe, singleCurrency)}</span>
          </div>
        </div>
      )}

      {trips.length === 0 ? (
        <EmptyState
          title="No trips yet"
          action={
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              Create your first trip
            </button>
          }
        >
          Create a trip, invite your friends by email, and start logging shared expenses.
        </EmptyState>
      ) : (
        <div className="trip-grid">
          {trips.map((t) => (
            <Link key={t.id} to={`/trips/${t.id}`} className="card trip-card">
              <div className="trip-card-top">
                <h3>{t.name}</h3>
                {t.role === 'owner' && <span className="badge">Owner</span>}
              </div>
              <p className="muted small">{formatDateRange(t.start_date, t.end_date)}</p>
              {t.description && <p className="trip-card-desc">{t.description}</p>}
              <div className="trip-card-stats">
                <div>
                  <span className="stat-label">Total spent</span>
                  <strong>{formatMoney(t.summary.totalCents, t.currency)}</strong>
                </div>
                <div>
                  <span className="stat-label">Your balance</span>
                  <strong>
                    <NetAmount cents={t.summary.myNetCents} currency={t.currency} />
                  </strong>
                </div>
              </div>
              <div className="trip-card-footer">
                <AvatarStack users={t.members} />
                <span className="muted small">
                  {t.summary.expenseCount} expense{t.summary.expenseCount === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="New trip" onClose={() => setCreating(false)}>
          <TripForm onCancel={() => setCreating(false)} onSaved={(trip) => navigate(`/trips/${trip.id}/members`)} />
        </Modal>
      )}
    </>
  );
}

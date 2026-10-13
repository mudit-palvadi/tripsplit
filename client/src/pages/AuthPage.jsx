import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBanner } from '../components/ui.jsx';

export default function AuthPage({ mode }) {
  const { login, register } = useAuth();
  const isLogin = mode === 'login';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="brand brand-lg">
          <span className="brand-mark">▲</span> TripSplit
        </div>
        <h1>Travel together. Split fairly.</h1>
        <p>
          Track shared trip expenses, split them any way you like, see who owes whom, and keep every note and
          booking in one place.
        </p>
        <ul className="auth-features">
          <li>Equal, exact, percentage and share-based splits</li>
          <li>Simplified settle-up suggestions</li>
          <li>Spending analytics by category, day and person</li>
          <li>Shared notes and trip documents</li>
        </ul>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <h2>{isLogin ? 'Welcome back' : 'Create your account'}</h2>
        <ErrorBanner message={error} />
        {!isLogin && (
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={set('name')} required autoFocus maxLength={60} />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} required autoFocus={isLogin} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={isLogin ? undefined : 6}
            placeholder={isLogin ? '' : 'At least 6 characters'}
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
        </button>
        <p className="auth-switch">
          {isLogin ? (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}

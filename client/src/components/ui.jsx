import { useEffect } from 'react';
import { avatarColor, formatMoney, initials } from '../utils.js';

export function Avatar({ user, size = 36 }) {
  return (
    <span
      className="avatar"
      title={user?.name}
      style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(user?.id) }}
    >
      {initials(user?.name)}
    </span>
  );
}

export function AvatarStack({ users, max = 4 }) {
  const shown = users.slice(0, max);
  return (
    <div className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={28} />
      ))}
      {users.length > max && <span className="avatar avatar-more">+{users.length - max}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ErrorBanner({ message }) {
  return message ? <div className="alert alert-error">{message}</div> : null;
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

/** Colored "you are owed / you owe" amount from the signed net balance. */
export function NetAmount({ cents, currency, labels = true }) {
  if (!cents) return <span className="muted">{labels ? 'Settled up' : formatMoney(0, currency)}</span>;
  const positive = cents > 0;
  return (
    <span className={positive ? 'pos' : 'neg'}>
      {labels && (positive ? 'Owed ' : 'Owes ')}
      {formatMoney(Math.abs(cents), currency)}
    </span>
  );
}

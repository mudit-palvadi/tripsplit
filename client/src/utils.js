export const CATEGORIES = [
  { name: 'Food & Drinks', color: '#f97316' },
  { name: 'Accommodation', color: '#8b5cf6' },
  { name: 'Transport', color: '#3b82f6' },
  { name: 'Activities', color: '#10b981' },
  { name: 'Shopping', color: '#ec4899' },
  { name: 'Groceries', color: '#84cc16' },
  { name: 'Fuel', color: '#eab308' },
  { name: 'Tickets', color: '#06b6d4' },
  { name: 'Other', color: '#64748b' },
];

export const categoryColor = (name) => CATEGORIES.find((c) => c.name === name)?.color ?? '#64748b';

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'THB', 'JPY'];

export function formatMoney(cents, currency = 'INR') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
  } catch {
    return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

function parseDate(value) {
  if (!value) return null;
  return value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(`${value.replace(' ', 'T')}Z`);
}

export function formatDate(value, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString(undefined, opts) : '';
}

export function formatDateTime(value) {
  const d = parseDate(value);
  return d ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

export function formatDateRange(start, end) {
  if (!start && !end) return 'No dates set';
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return start ? `From ${formatDate(start)}` : `Until ${formatDate(end)}`;
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

const AVATAR_COLORS = ['#0d9488', '#7c3aed', '#db2777', '#ea580c', '#2563eb', '#16a34a', '#ca8a04', '#dc2626'];
export const avatarColor = (id) => AVATAR_COLORS[(id ?? 0) % AVATAR_COLORS.length];

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Same algorithm as the server: proportional split where leftover cents go to the largest remainders. */
export function distribute(totalCents, entries) {
  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  if (!totalWeight) return new Map();
  const parts = entries.map((e) => {
    const exact = (totalCents * e.weight) / totalWeight;
    return { userId: e.userId, cents: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remainder = totalCents - parts.reduce((s, p) => s + p.cents, 0);
  const byFraction = [...parts].sort((a, b) => b.frac - a.frac);
  for (let i = 0; remainder > 0; i = (i + 1) % byFraction.length, remainder--) byFraction[i].cents += 1;
  return new Map(parts.map((p) => [p.userId, p.cents]));
}

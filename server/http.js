export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function fail(status, message) {
  throw new HttpError(status, message);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function text(value, field, { max = 200, optional = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail(400, `${field} must be text`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (optional) return null;
    fail(400, `${field} is required`);
  }
  if (trimmed.length > max) fail(400, `${field} must be at most ${max} characters`);
  return trimmed;
}

export function date(value, field, { optional = false } = {}) {
  if (!value) {
    if (optional) return null;
    fail(400, `${field} is required`);
  }
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    fail(400, `${field} must be a valid date (YYYY-MM-DD)`);
  }
  return value;
}

export function amountToCents(value, field = 'Amount') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) fail(400, `${field} must be a positive number`);
  const cents = Math.round(n * 100);
  if (cents <= 0) fail(400, `${field} must be at least 0.01`);
  if (cents > 1e13) fail(400, `${field} is too large`);
  return cents;
}

export function id(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(400, `${field} is invalid`);
  return n;
}

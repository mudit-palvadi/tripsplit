const TOKEN_KEY = 'tripsplit_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleError(res) {
  const data = await res.json().catch(() => null);
  if (res.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }
  throw new Error(data?.error || `Request failed (${res.status})`);
}

/** JSON API helper. Pass `body` for JSON or `form` for multipart uploads. */
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = authHeaders();
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (!res.ok) await handleError(res);
  return res.status === 204 ? null : res.json();
}

/** Fetches an authenticated file and either downloads it or opens it in a new tab. */
export async function fetchFile(path, filename, { open = false } = {}) {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  if (!res.ok) await handleError(res);
  const url = URL.createObjectURL(await res.blob());
  if (open) {
    window.open(url, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

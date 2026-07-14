import { runtimeEnv } from './runtime-env';

const API_BASE_URL = runtimeEnv.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api/v1';
const TOKEN_KEY = 'doctor_md_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && options.auth !== false) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.message ||
      Object.values(data?.errors || {})?.flat()?.[0] ||
      'A apărut o eroare. Încercați din nou.';
    const error = new Error(String(message));
    Object.assign(error, { status: response.status, data });
    throw error;
  }

  return data as T;
}

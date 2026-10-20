import { VALIDATION_EVENT, VALIDATION_CLEAR_EVENT, type FieldErrors } from './validation';
import { runtimeEnv } from './runtime-env';

const API_BASE_URL = runtimeEnv.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api/v1';
const TOKEN_KEY = 'doctor_md_token';

export const UNAUTHORIZED_EVENT = 'doctor-md:unauthorized';

export type ApiError = Error & {
  status?: number;
  data?: unknown;
  raw?: string;
  errors?: FieldErrors;
};

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

function buildError(message: string, extra: Partial<ApiError> = {}): ApiError {
  const error = new Error(message) as ApiError;
  Object.assign(error, extra);
  return error;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const requestPage = window.location.pathname + window.location.search;
  const scope = document.activeElement?.closest<HTMLElement>('form, [role="dialog"], [data-validation-scope]') || null;
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const authenticated = Boolean(token) && options.auth !== false;

  if (authenticated) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    // Rețea picată, DNS, CORS sau server oprit.
    throw buildError('Nu am putut contacta serverul. Verificați conexiunea.', { status: 0 });
  }

  const text = await response.text();

  // Serverul poate întoarce HTML în loc de JSON (502/504 de la nginx, pagina de
  // debug Laravel, o pagină de eroare de la CDN, sau index.html dacă proxy-ul
  // /api este picat). Fără try/catch aici, JSON.parse arunca SyntaxError și
  // aplicația rămânea cu ecran alb.
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw buildError(
        response.status >= 500 || response.ok
          ? 'Serverul a întors un răspuns invalid. Încercați din nou în câteva momente.'
          : 'A apărut o eroare. Încercați din nou.',
        { status: response.status, raw: text.slice(0, 500) }
      );
    }
  }

  if (response.status === 401 && authenticated) {
    // Sesiune expirată sau token invalidat: curățăm tokenul și anunțăm
    // AuthContext, care face redirect la /login în loc să lase paginile să
    // crape pe date lipsă.
    setToken(null);
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw buildError('Sesiunea a expirat. Autentificați-vă din nou.', { status: 401, data });
  }

  if (!response.ok) {
    const payload = data as { message?: string; errors?: Record<string, string[]> } | null;
    const errors: FieldErrors = Object.fromEntries(Object.entries(payload?.errors || {}).map(([key, values]) => [key, (Array.isArray(values) ? values : [values]).map((value) => typeof value === 'string' && !value.includes('validation.') ? value : 'Verifică valoarea completată.') ]));
    if (response.status === 422 && Object.keys(errors).length) {
      window.dispatchEvent(new CustomEvent(VALIDATION_EVENT, { detail: { errors, scope, path: requestPage } }));
      throw buildError('Verifică datele completate și corectează câmpurile indicate.', { status: 422, data, errors });
    }
    const firstValidationError = Object.values(errors).flat()[0];
    const message = firstValidationError || payload?.message || 'A apărut o eroare. Încercați din nou.';

    const readable = response.status >= 500 ? 'Serviciul este temporar indisponibil. Încearcă din nou în câteva momente.' : response.status === 429 ? 'Ai făcut prea multe încercări. Așteaptă puțin și încearcă din nou.' : String(message).includes('validation.') ? 'Verifică datele completate și încearcă din nou.' : String(message);
    throw buildError(readable, { status: response.status, data, errors });
  }

  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) window.dispatchEvent(new CustomEvent(VALIDATION_CLEAR_EVENT, { detail: { scope } }));
  return data as T;
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const first = Object.values(payload.errors ?? {}).flat()[0];
    throw new Error(String(first || payload.message || 'Fișierul nu a putut fi încărcat.'));
  }
  return response.blob();
}

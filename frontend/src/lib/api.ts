import { runtimeEnv } from './runtime-env';

const API_BASE_URL = runtimeEnv.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api/v1';
const TOKEN_KEY = 'doctor_md_token';

export const UNAUTHORIZED_EVENT = 'doctor-md:unauthorized';

export type ApiError = Error & {
  status?: number;
  data?: unknown;
  raw?: string;
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
    const firstValidationError = Object.values(payload?.errors ?? {}).flat()[0];
    const message = payload?.message || firstValidationError || 'A apărut o eroare. Încercați din nou.';

    throw buildError(String(message), { status: response.status, data });
  }

  return data as T;
}

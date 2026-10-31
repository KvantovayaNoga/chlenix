// ============================================================
// Клиент REST API Chlenix (данные хранятся в PostgreSQL на сервере)
// ============================================================

// По умолчанию API доступен по относительному пути /api — nginx проксирует
// его на backend-контейнер. Это делает сборку независимой от адреса сервера.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

const TOKEN_KEY = 'chlenix_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError('Сервер недоступен. Проверьте подключение.', 0);
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    // Сессия истекла — очищаем токен, приложение перенаправит на страницу входа
    setToken(null);
    window.dispatchEvent(new CustomEvent('chlenix:unauthorized'));
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(data?.error || `Ошибка запроса (${response.status})`, response.status);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

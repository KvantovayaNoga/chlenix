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

// Таймаут запроса к API. Без него «зависшее» соединение (сервер не отвечает,
// сетевой blackhole, nginx без upstream) вечно держит промис — кнопки форм
// застревают в состоянии «Сохранение…». Через это время запрос прерывается,
// и формы корректно показывают ошибку, оставляя данные пользователя.
const REQUEST_TIMEOUT_MS = 25_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Собственный AbortController + таймер НЕ перезаписывают signal из options:
  // если вызывающий код уже передал свой signal — объединяем оба.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const externalSignal = options.signal as AbortSignal | null | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error)?.name === 'AbortError') {
      throw new ApiError('Сервер не отвечает. Повторите попытку позже.', 0);
    }
    throw new ApiError('Сервер недоступен. Проверьте подключение.', 0);
  }
  clearTimeout(timer);

  if (response.status === 401 && !path.startsWith('/auth/')) {
    // Сессия истекла — очищаем токен, приложение перенаправит на страницу входа.
    // Текст ошибки читается из уже распарсенного тела ответа ниже; здесь тело
    // ещё не доступно (его можно прочитать только один раз), поэтому detail не передаём.
    setToken(null);
    window.dispatchEvent(new CustomEvent('chlenix:unauthorized'));
  }

  if (response.status === 204) return undefined as T;

  // Чтение тела тоже ограничено таймаутом: если сервер принял запрос, но
  // «подвис» на отдаче ответа, fetch() здесь никогда не завершился бы —
  // именно так кнопка «Сохранить» застревала в состоянии «Сохранение…».
  let data: any;
  try {
    data = await Promise.race([
      response.json().catch(() => null),
      new Promise((_, reject) => setTimeout(() => reject(new ApiError('Сервер не завершил ответ. Изменения могли НЕ сохраниться — проверьте данные и повторите.', 0)), REQUEST_TIMEOUT_MS)),
    ]);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Сервер вернул некорректный ответ. Изменения могли НЕ сохраниться.', 0);
  }

  if (!response.ok) {
    // П.4: если сервер сообщает о блокировке учётной записи (401 из authMiddleware
    // или 403 на входе) — мгновенно отзываем локальную сессию и права на UI,
    // не дожидаясь перезагрузки страницы.
    if (!path.startsWith('/auth/') && /заблокиров/i.test(String(data?.error ?? ''))) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('chlenix:unauthorized', { detail: data?.error }));
    }
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

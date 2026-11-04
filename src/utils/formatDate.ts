// ============================================================
// Единый формат отображения даты/времени по всему приложению:
//   дата  — DD-MM-YYYY
//   время — HH:MM:SS без лидирующих нулей (9:05:7, а не 09:05:07)
// ============================================================

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Убираем лидирующий ноль из часов: "09" -> "9", "10" остаётся "10" */
const trimHours = (h: string) => h.replace(/^0(?=\d)/, '');

export function formatDate(value?: string | Date | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Время HH:MM:SS без лидирующих нулей в часах (секунды всегда двухзначные) */
export function formatTime(value?: string | Date | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${trimHours(pad2(d.getHours()))}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Дата и время: DD-MM-YYYY HH:MM:SS (без лидирующего нуля в часах) */
export function formatDateTime(value?: string | Date | null): string {
  const date = formatDate(value);
  if (!date) return '';
  return `${date} ${formatTime(value)}`;
}

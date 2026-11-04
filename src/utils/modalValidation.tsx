// ============================================================
// Единый механизм внутренней валидации модальных окон.
//
// Правила проекта:
//  1. Кнопка «Создать/Сохранить» НЕ должна закрывать модалку, если сущность
//     реально не создана (не заполнены обязательные поля или сервер отклонил
//     запрос). Закрытие выполняет только вызывающая сторона — по результату
//     await-сохранения.
//  2. Обязательные поля подсвечиваются в общем стиле проекта: красная рамка +
//     всплывающая инлайн-подсказка под полем («укажите, что дозаполнить»).
//  3. Ошибки сохранения (сервер отклонил) показываются баннером внутри модалки.
//
// Использование:
//   const v = useModalValidation();
//   <input className={v.cls('name', baseCls)} value={...} onChange={(e) => { setX(...); v.touch('name'); }} />
//   {v.hint('name', 'Укажите наименование')}
//   onSubmit: if (!v.require({ name: form.name.trim(), ... })) return;
//             const ok = await save(...); if (ok === false) v.setSaveError('…'); else onClose();
// ============================================================
import { useState, type FormEvent, type ReactNode } from 'react';

export type Validator = {
  /** Поля, к которым пользователь «прикоснулся» (изменил значение) — до этого
   *  ошибки не показываем, чтобы не пугать красным на пустой форме. */
  touched: Record<string, boolean>;
  /** Флаг после первой попытки отправить форму — показываем ВСЕ ошибки. */
  submitted: boolean;
  /** Явная ошибка сохранения (ответ сервера) — баннер внутри модалки. */
  saveError: string | null;
  /** Отметить поле как изменённое (для немедленного пересчёта подсветки). */
  touch: (field: string) => void;
  setSaveError: (msg: string | null) => void;
  /** Сброс состояния при повторной попытке. */
  reset: () => void;
  /** Проверка карты значений { поле: значение }. Пустая строка / null / undefined /
   *  NaN считаются незаполненными. Возвращает true, если всё заполнено; иначе
   *  помечает форму как отправленную (подсветка всех обязательных полей). */
  require: (values: Record<string, unknown>) => boolean;
  /** Класс поля: базовый + красная рамка, если есть ошибка по полю (см. `has`). */
  cls: (field: string, base: string, error?: string | null) => string;
  /** Инлайн-подсказка под полем (появляется вместе с подсветкой). */
  hint: (field: string, message: string, error?: string | null) => ReactNode;
  /** Есть ли ошибка по полю: явная ошибка ИЛИ (пустое значение из `values` И поле
   *  уже менялось/форма отправлялась). */
  has: (field: string, error?: string | null) => boolean;
  /** Баннер ошибки сохранения внизу формы (null, если ошибки нет). */
  banner: () => ReactNode;
};

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'number' && Number.isNaN(v));

/** Базовые классы полей светлых модалок (общий стиль проекта). */
export const inputCls =
  'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200';
/** Базовые классы полей тёмных модалок (интерфейсы/сервисы ВМ). */
export const darkInputCls =
  'w-full px-3 py-2 border border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-500';

const errRing = 'border-red-400 dark:border-red-600 focus:ring-red-400';

export function useModalValidation(requiredValues?: Record<string, unknown>): Validator {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const touch = (field: string) => setTouched((p) => (p[field] ? p : { ...p, [field]: true }));
  const reset = () => { setTouched({}); setSubmitted(false); setSaveError(null); };

  const require = (values: Record<string, unknown>) => {
    const bad = Object.values(values).some(isBlank);
    if (bad) setSubmitted(true);
    else setSaveError(null);
    return !bad;
  };

  // Поле считается «в ошибке», если передана явная ошибка ИЛИ оно пустое и
  // форма уже отправлялась (submitted) / пользователь менял это поле (touched).
  const has = (field: string, explicit?: string | null) => {
    if (explicit) return true;
    if (!submitted && !touched[field]) return false;
    return isBlank(requiredValues?.[field]);
  };

  const cls = (field: string, base: string, error?: string | null) =>
    `${base}${has(field, error) ? ` ${errRing}` : ''}`;

  const hint = (field: string, message: string, error?: string | null) => {
    if (!has(field, error)) return null;
    return <p className="text-xs text-red-500 mt-1">{error || message}</p>;
  };

  const banner = () =>
    saveError ? (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {saveError}
      </div>
    ) : null;

  return { touched, submitted, saveError, touch, setSaveError, reset, require, has, cls, hint, banner };
}

/**
 * Универсальный обработчик отправки формы модалки:
 *  - блокирует повторную отправку во время сохранения (защита от двойного клика),
 *  - НЕ даёт закрыть модалку, если сохранение не удалось: onClose вызывается
 *    только при result !== false, текст ошибки остаётся внутри формы (banner).
 */
export async function submitModal(opts: {
  e: FormEvent;
  validate: () => boolean;
  save: () => Promise<boolean | { success: boolean; error?: string } | unknown>;
  onClose: () => void;
  setSaving: (v: boolean) => void;
  setSaveError: (msg: string | null) => void;
  successMessage?: string;
}) {
  opts.e.preventDefault();
  if (!opts.validate()) return;
  opts.setSaving(true);
  opts.setSaveError(null);
  try {
    const res = await opts.save();
    const failed =
      res === false ||
      (res && typeof res === 'object' && 'success' in (res as any) && (res as any).success === false);
    if (failed) {
      const serverMsg =
        res && typeof res === 'object' && 'error' in (res as any)
          ? String((res as any).error || '')
          : '';
      opts.setSaveError(
        serverMsg ||
          'Не удалось сохранить: сервер отклонил запрос (проверьте данные, уникальность обязательных полей и доступ к организации). Окно осталось открытым — изменения не потеряны.',
      );
      return; // ВАЖНО: модалка НЕ закрывается, пока сущность не создана
    }
    opts.onClose();
  } catch (err: any) {
    opts.setSaveError(err?.message || 'Не удалось сохранить: ошибка соединения с сервером.');
  } finally {
    opts.setSaving(false);
  }
}

/** Баннер со списком пропущенных обязательных полей (всплывающая подсказка
 *  «что дозаполнить») — используется в простых модалках справочников. */
export function MissingFieldsBanner({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
      <p className="font-medium">Заполните обязательные поля:</p>
      <ul className="list-disc list-inside mt-1 space-y-0.5">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

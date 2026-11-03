// Статусная модель оборудования (замена «Состояние» → «Статус»).
// Ключи совпадают со значениями enum Condition (prisma) и CHECK-ограничением
// в schema.sql; переводы для истории — VALUE_TRANSLATIONS.condition на бэкенде.
export type EquipmentStatusKey =
  | 'exploitation'
  | 'exploitation_restricted'
  | 'reserve'
  | 'repair'
  | 'removed_from_register'
  | 'lost_stolen'
  | 'unfit'
  | 'for_writeoff';

const TINT = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export const statusLabels: Record<string, { label: string; color: string }> = {
  exploitation: { label: 'Эксплуатация', color: TINT.green },
  exploitation_restricted: { label: 'Эксплуатация с ограничениями', color: TINT.yellow },
  reserve: { label: 'Резерв', color: TINT.blue },
  repair: { label: 'Ремонт', color: TINT.orange },
  removed_from_register: { label: 'Снято с учета', color: TINT.gray },
  lost_stolen: { label: 'Утерян/Украдено', color: TINT.red },
  unfit: { label: 'Непригодно к эксплуатации', color: TINT.red },
  for_writeoff: { label: 'Для списания', color: TINT.cyan },
  // Устаревшие значения: до миграции данных могут встречаться в API-ответах.
  new: { label: 'Новое', color: TINT.green },
  good: { label: 'Хорошее', color: TINT.blue },
  satisfactory: { label: 'Удовлетворительное', color: TINT.yellow },
  needs_repair: { label: 'Требует ремонта', color: TINT.orange },
  written_off: { label: 'Списано', color: TINT.gray },
};

/** Статус требует указать дефект или причину ограничений (поле defectNote). */
export function statusRequiresDefect(status?: string | null): boolean {
  return status === 'exploitation_restricted';
}

/** Дефолтный статус для новых карточек. */
export const DEFAULT_EQUIPMENT_STATUS = 'exploitation';

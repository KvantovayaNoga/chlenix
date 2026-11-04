import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, History, User, Calendar, X } from 'lucide-react';
import { api } from '../api/client';
import { onDataChanged } from '../store/dataStore';

export interface HistoryEntry {
  id: string;
  action: 'created' | 'updated' | 'assigned' | 'unassigned' | 'deleted';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy: string;
  changedAt: string;
  // Изменения одного сохранения объединены общим batchId.
  batchId?: string | null;
}

interface HistoryLogProps {
  history: HistoryEntry[];
  title?: string;
  /**
   * Ключ сущности (например `org:${id}`, `eq:${id}`, `vm:${id}`). Используется
   * для сброса раскрытого состояния модалки при переключении между карточками.
   */
  entityKey?: string;
  /**
   * Количество записей в свёрнутом («общем») виде. По умолчанию — 3.
   * Значение, переданное извне, ограничивается сверху тремя: по требованию UI
   * везде показывается не более 3 последних изменений.
   */
  collapsedCount?: number;
  /** Вызывается при клике на блок «История изменений» — открывает модалку полной истории. */
  onOpenFull?: () => void;
  /** Вызывается при закрытии модалки полной истории. */
  onCloseFull?: () => void;
  /**
   * Управляемое состояние модалки полной истории. Нужно для случаев, когда
   * история рендерится внутри другого модального окна (вложенная модалка
   * не работает корректно) — родитель сам хранит флаг и рендерит модалку
   * через <FullHistoryModal>.
   */
  controlledFull?: boolean;
}

// Группа в списке истории: одна строка на сохранение. Заголовок — запись с
// fieldName === 'изменения' (краткий список полей), детали — остальные записи
// группы («поле: было X → стало Y»). Для старых данных без batchId каждая
// запись остаётся отдельной группой.
interface HistoryGroup {
  key: string;
  head: HistoryEntry;      // отображаемая в списке запись (заголовок или одиночная)
  details: HistoryEntry[]; // детализация по полям (для модального окна)
}

// Специальный маркер: в selectedGroup означает «открыта модалка полной истории».
const FULL_SENTINEL: HistoryGroup = { key: '__full__', head: {} as HistoryEntry, details: [] };

const GROUP_FIELD = 'изменения';

export const getActionText = (action: HistoryEntry['action']) => {
  switch (action) {
    case 'created': return { text: 'Создано', color: 'text-green-400', bgColor: 'bg-green-900/20' };
    case 'updated': return { text: 'Обновлено', color: 'text-blue-400', bgColor: 'bg-blue-900/20' };
    case 'assigned': return { text: 'Закреплено', color: 'text-indigo-400', bgColor: 'bg-indigo-900/20' };
    case 'unassigned': return { text: 'Откреплено', color: 'text-orange-400', bgColor: 'bg-orange-900/20' };
    case 'deleted': return { text: 'Удалено', color: 'text-red-400', bgColor: 'bg-red-900/20' };
  }
};

const renderDiff = (oldValue: string, newValue: string) => {
  // Простое сравнение строк
  if (oldValue === newValue) {
    return <span className="text-gray-500 dark:text-gray-400">Без изменений</span>;
  }

  // Если значения многострочные, показываем diff по строкам
  const oldLines = oldValue.split('\n');
  const newLines = newValue.split('\n');

  if (oldLines.length > 1 || newLines.length > 1) {
    return (
      <div className="font-mono text-xs space-y-1">
        {oldLines.map((line, idx) => (
          <div key={`old-${idx}`} className="flex items-center">
            <span className="text-red-400 w-4 flex-shrink-0 text-center leading-none">-</span>
            <span className="text-red-300 bg-red-900/20 px-2 py-0.5 rounded flex-1">{line}</span>
          </div>
        ))}
        {newLines.map((line, idx) => (
          <div key={`new-${idx}`} className="flex items-center">
            <span className="text-green-400 w-4 flex-shrink-0 text-center leading-none">+</span>
            <span className="text-green-300 bg-green-900/20 px-2 py-0.5 rounded flex-1">{line}</span>
          </div>
        ))}
      </div>
    );
  }

  // Для однострочных значений показываем старое и новое
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-red-400 font-mono text-sm flex-shrink-0 w-3 text-center leading-none">-</span>
        <span className="text-red-300 bg-red-900/20 px-2 py-1 rounded flex-1 break-all">{oldValue}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-400 font-mono text-sm flex-shrink-0 w-3 text-center leading-none">+</span>
        <span className="text-green-300 bg-green-900/20 px-2 py-1 rounded flex-1 break-all">{newValue}</span>
      </div>
    </div>
  );
};

/**
 * Хук актуальной истории изменений сущности. Загружает историю с сервера
 * (GET `${path}?_t=<revision>`) и автоматически подтягивает новые записи:
 *  - при изменении revision (счётчик обновлений глобального стора);
 *  - при каждом открытии/обновлении модалки полной истории (проверка на лету);
 *  - при фокусе окна / возврате на вкладку браузера.
 * Поэтому после любого сохранения история обновляется ВЕЗДЕ без перезагрузки
 * страницы и без перехода на другие разделы.
 */
export function useEntityHistory(path: string | null, revision?: number): { history: HistoryEntry[]; loading: boolean } {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Монотонный счётчик ответов: защищает от «гонки» асинхронных запросов
  // (поздний ответ по старым данным не должен перетирать свежие).
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!path) { setHistory([]); setLoading(false); return; }
    const id = ++reqIdRef.current;
    setLoading(true);
    api.get<HistoryEntry[]>(`${path}${path.includes('?') ? '&' : '?'}_t=${revision ?? 0}`)
      .then((h) => { if (id === reqIdRef.current) { setHistory(h); setLoading(false); } })
      .catch(() => { if (id === reqIdRef.current) { setHistory([]); setLoading(false); } });
  }, [path, revision]);

  useEffect(() => {
    if (!path) return;
    const refetch = () => {
      const id = ++reqIdRef.current;
      api.get<HistoryEntry[]>(`${path}${path.includes('?') ? '&' : '?'}_t=${Date.now()}`)
        .then((h) => { if (id === reqIdRef.current) setHistory(h); })
        .catch(() => {});
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refetch(); });
    // Мгновенное обновление ВЕЗДЕ после любой успешной мутации данных
    // (сохранение в любой карточке поднимает событие data-changed в сторе).
    const unsubscribe = onDataChanged(refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      unsubscribe();
    };
  }, [path]);

  return { history, loading };
}

function groupHistory(history: HistoryEntry[]): HistoryGroup[] {
  const byBatch = new Map<string, HistoryEntry[]>();
  const singles: HistoryGroup[] = [];
  for (const e of history) {
    if (e.batchId) {
      const arr = byBatch.get(e.batchId);
      if (arr) arr.push(e);
      else byBatch.set(e.batchId, [e]);
    } else {
      singles.push({ key: e.id, head: e, details: [] });
    }
  }
  const groups: HistoryGroup[] = [...singles];
  for (const [batchId, entries] of byBatch) {
    const sorted = [...entries].sort((a, b) => a.changedAt.localeCompare(b.changedAt) || a.id.localeCompare(b.id));
    const headline = sorted.find((e) => e.fieldName === GROUP_FIELD);
    const details = sorted.filter((e) => e.fieldName !== GROUP_FIELD);
    const head = headline ?? {
      ...sorted[0],
      fieldName: GROUP_FIELD,
      newValue: `Обновлено: ${details.map((d) => d.fieldName).filter(Boolean).join(', ') || 'поля'} (${details.length})`,
    };
    groups.push({ key: batchId, head, details });
  }
  // Новые записи сверху (история приходит от сервера в порядке desc).
  return groups.sort((a, b) => b.head.changedAt.localeCompare(a.head.changedAt));
}

export function HistoryLog({ history, title = 'История изменений', entityKey, collapsedCount = 3, onOpenFull, onCloseFull, controlledFull }: HistoryLogProps) {
  const [selectedGroup, setSelectedGroup] = useState<HistoryGroup | null>(null);
  // Внешнее управление модалкой полной истории (используется страницами,
  // которые рендерят историю внутри модальных окон и не могут вложить модалку).
  const [internalFullOpen, setInternalFullOpen] = useState(false);
  const fullOpen = controlledFull !== undefined ? controlledFull : internalFullOpen;
  const openFull = () => { controlledFull === undefined && setInternalFullOpen(true); onOpenFull?.(); };
  const closeFull = () => { controlledFull === undefined && setInternalFullOpen(false); onCloseFull?.(); };
  // При переключении между карточками (смена entityKey) закрываем модалку,
  // чтобы не показывать детали истории другой сущности.
  useEffect(() => { setSelectedGroup(null); setInternalFullOpen(false); }, [entityKey]);
  const groups = useMemo(() => groupHistory(history), [history]);
  // Страховка от «уезжающих» лишних записей: в общем виде — строго не более 3.
  const effectiveCollapsedCount = Math.min(collapsedCount ?? 3, 3);

  if (history.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <History className="w-5 h-5" />
          {title}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">История изменений пуста</p>
      </div>
    );
  }

  const visibleGroups = groups.slice(0, effectiveCollapsedCount);
  const hiddenCount = groups.length - visibleGroups.length;

  // Если открыта модалка полной истории (детали конкретной записи не выбраны) — показываем её.
  if (fullOpen && selectedGroup === FULL_SENTINEL) {
    return <FullHistoryModal groups={groups} title={title} onClose={closeFull} />;
  }

  return (
    <>
      <div
        className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer ring-1 ring-transparent hover:ring-indigo-300/60 dark:hover:ring-indigo-600/40 transition`}
        onClick={() => { setSelectedGroup(FULL_SENTINEL); openFull(); }}
        role="button"
        title="Открыть полную историю изменений"
      >
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><History className="w-5 h-5" />{title}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            <ChevronDown className="w-4 h-4" />Показать все ({groups.length})
          </span>
        </h3>
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const entry = group.head;
            const action = getActionText(entry.action);
            const isGroup = entry.fieldName === GROUP_FIELD;
            return (
              <div
                key={group.key} 
                className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
                onClick={(e) => { e.stopPropagation(); setSelectedGroup(group); }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{entry.changedBy}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {new Date(entry.changedAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="text-sm">
                  <span className={`font-medium ${action.color}`}>
                    {action.text}
                  </span>
                  {/* Группа изменений: показываем краткий заголовок «Обновлено: поле1, поле2…»,
                      без diff — детали раскрываются по клику в модальном окне. */}
                  {isGroup ? (
                    <span className="text-gray-600 dark:text-gray-300">
                      {entry.newValue?.startsWith('Обновлено:') ? `: ${entry.newValue.slice('Обновлено:'.length).trim()}` : `: ${entry.newValue ?? entry.fieldName}`}
                      {group.details.length > 1 && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(детали по клику)</span>
                      )}
                    </span>
                  ) : (
                    <>
                      {entry.fieldName && (
                        <span className="text-gray-600 dark:text-gray-300">: {entry.fieldName}</span>
                      )}
                      {entry.oldValue && entry.newValue && (
                        <div className="mt-2 text-xs">
                          {renderDiff(entry.oldValue, entry.newValue)}
                        </div>
                      )}
                      {!entry.fieldName && entry.newValue && (
                        <span className="text-gray-600 dark:text-gray-300">: {entry.newValue}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedGroup(FULL_SENTINEL); openFull(); }}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg py-2 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            Показать всю историю ({groups.length})
          </button>
        )}
      </div>

      {selectedGroup && selectedGroup !== FULL_SENTINEL && (
        <div className="modal-root fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <History className="w-6 h-6" />
                Детали изменения
              </h2>
              <button onClick={() => setSelectedGroup(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Действие</p>
                <p className={`text-lg font-semibold ${getActionText(selectedGroup.head.action).color}`}>
                  {getActionText(selectedGroup.head.action).text}
                </p>
              </div>
              {/* Краткая сводка группы (если есть) */}
              {selectedGroup.head.fieldName === GROUP_FIELD && selectedGroup.head.newValue && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Что обновлено</p>
                  <p className="text-gray-800 dark:text-gray-200 font-medium">{selectedGroup.head.newValue}</p>
                </div>
              )}
              {/* Детализация: по порядку — каждое изменённое поле с чего на что */}
              {selectedGroup.details.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Изменения по полям</p>
                  <div className="space-y-3">
                    {selectedGroup.details.map((d) => (
                      <div key={d.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">{d.fieldName}</p>
                        {d.oldValue !== null && d.oldValue !== undefined && d.newValue !== null && d.newValue !== undefined ? (
                          renderDiff(d.oldValue, d.newValue)
                        ) : (
                          <p className="text-gray-700 dark:text-gray-300 text-sm">{d.newValue ?? d.oldValue}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Одиночная запись без группы (старые данные / создание / закрепление) */}
              {selectedGroup.details.length === 0 && selectedGroup.head.fieldName !== GROUP_FIELD && (
                <>
                  {selectedGroup.head.fieldName && (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Поле</p>
                      <p className="text-gray-800 dark:text-gray-200 font-medium">{selectedGroup.head.fieldName}</p>
                    </div>
                  )}
                  {selectedGroup.head.oldValue && selectedGroup.head.newValue && (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Изменения</p>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        {renderDiff(selectedGroup.head.oldValue, selectedGroup.head.newValue)}
                      </div>
                    </div>
                  )}
                  {!selectedGroup.head.oldValue && selectedGroup.head.newValue && (
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Значение</p>
                      <p className="text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">{selectedGroup.head.newValue}</p>
                    </div>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Автор изменений</p>
                  <p className="text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {selectedGroup.head.changedBy}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Дата и время</p>
                  <p className="text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(selectedGroup.head.changedAt).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Модалка ПОЛНОЙ истории изменений: все группы (одно сохранение = одна строка)
 * сверху вниз, от самых свежих к старым. Клик по строке раскрывает детализацию
 * «было → стало» по каждому полю. Используется HistoryLog внутри и может
 * рендериться страницами напрямую (например, когда история показывается
 * внутри другой модалки и вложить модалку нельзя).
 */
export function FullHistoryModal({ groups: groupsProp, history, title = 'История изменений', onClose }: {
  groups?: HistoryGroup[];
  history?: HistoryEntry[];
  title?: string;
  onClose: () => void;
}) {
  const allGroups = useMemo(() => groupsProp ?? groupHistory(history ?? []), [groupsProp, history]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="modal-root fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <History className="w-6 h-6" />
            {title}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({allGroups.length})</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="Закрыть">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          {allGroups.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-sm">История изменений пуста</p>
          )}
          {allGroups.map((group) => {
            const entry = group.head;
            const action = getActionText(entry.action);
            const isGroup = entry.fieldName === GROUP_FIELD;
            const expanded = expandedKey === group.key;
            return (
              <div
                key={group.key}
                className={`bg-gray-50 dark:bg-gray-700/60 rounded-lg border transition-colors ${expanded ? 'border-indigo-300 dark:border-indigo-600' : 'border-gray-200 dark:border-gray-600'} cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/60`}
                onClick={() => setExpandedKey(expanded ? null : group.key)}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{entry.changedBy}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${action.color} ${action.bgColor}`}>{action.text}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                      <Calendar className="w-3 h-3" />
                      {new Date(entry.changedAt).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300 break-all">
                    {isGroup
                      ? (entry.newValue?.startsWith('Обновлено:') ? entry.newValue : `${entry.newValue ?? entry.fieldName ?? ''}`)
                      : (entry.fieldName ? `${entry.fieldName}: ${entry.newValue ?? ''}` : (entry.newValue ?? ''))}
                  </div>
                  {(group.details.length > 0 || (!isGroup && entry.oldValue && entry.newValue)) && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      {expanded ? 'Скрыть детали' : `Показать детали${group.details.length > 1 ? ` (${group.details.length})` : ''}`}
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-600 pt-3">
                    {group.details.length > 0 ? (
                      group.details.map((d) => (
                        <div key={d.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">{d.fieldName}</p>
                          {d.oldValue != null && d.newValue != null
                            ? renderDiff(d.oldValue, d.newValue)
                            : <p className="text-gray-700 dark:text-gray-300 text-sm">{d.newValue ?? d.oldValue}</p>}
                        </div>
                      ))
                    ) : !isGroup && entry.oldValue && entry.newValue ? (
                      renderDiff(entry.oldValue, entry.newValue)
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

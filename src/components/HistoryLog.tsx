import { History, User, Calendar, X } from 'lucide-react';
import { useMemo, useState } from 'react';

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

const GROUP_FIELD = 'изменения';

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

export function HistoryLog({ history, title = 'История изменений' }: HistoryLogProps) {
  const [selectedGroup, setSelectedGroup] = useState<HistoryGroup | null>(null);
  const groups = useMemo(() => groupHistory(history), [history]);

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

  const getActionText = (action: HistoryEntry['action']) => {
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

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <History className="w-5 h-5" />
          {title}
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {groups.map((group) => {
            const entry = group.head;
            const action = getActionText(entry.action);
            const isGroup = entry.fieldName === GROUP_FIELD;
            return (
              <div 
                key={group.key} 
                className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
                onClick={() => setSelectedGroup(group)}
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
      </div>

      {selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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

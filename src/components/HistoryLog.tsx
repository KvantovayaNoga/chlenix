import { History, User, Calendar, X } from 'lucide-react';
import { useState } from 'react';

export interface HistoryEntry {
  id: string;
  action: 'created' | 'updated' | 'assigned' | 'unassigned' | 'deleted';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy: string;
  changedAt: string;
}

interface HistoryLogProps {
  history: HistoryEntry[];
  title?: string;
}

export function HistoryLog({ history, title = 'История изменений' }: HistoryLogProps) {
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  if (history.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <History className="w-5 h-5" />
          {title}
        </h3>
        <p className="text-gray-400 text-sm">История изменений пуста</p>
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
      return <span className="text-gray-400">Без изменений</span>;
    }

    // Если значения многострочные, показываем diff по строкам
    const oldLines = oldValue.split('\n');
    const newLines = newValue.split('\n');

    if (oldLines.length > 1 || newLines.length > 1) {
      return (
        <div className="font-mono text-xs space-y-1">
          {oldLines.map((line, idx) => (
            <div key={`old-${idx}`} className="flex">
              <span className="text-red-400 w-4 flex-shrink-0">-</span>
              <span className="text-red-300 bg-red-900/20 px-2 py-0.5 rounded flex-1">{line}</span>
            </div>
          ))}
          {newLines.map((line, idx) => (
            <div key={`new-${idx}`} className="flex">
              <span className="text-green-400 w-4 flex-shrink-0">+</span>
              <span className="text-green-300 bg-green-900/20 px-2 py-0.5 rounded flex-1">{line}</span>
            </div>
          ))}
        </div>
      );
    }

    // Для однострочных значений показываем старое и новое
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-red-400 font-mono text-sm flex-shrink-0">-</span>
          <span className="text-red-300 bg-red-900/20 px-2 py-1 rounded flex-1 break-all">{oldValue}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-green-400 font-mono text-sm flex-shrink-0">+</span>
          <span className="text-green-300 bg-green-900/20 px-2 py-1 rounded flex-1 break-all">{newValue}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <History className="w-5 h-5" />
          {title}
        </h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {history.map((entry) => {
            const action = getActionText(entry.action);
            return (
              <div 
                key={entry.id} 
                className="bg-gray-700 rounded-lg p-3 border border-gray-600 cursor-pointer hover:bg-gray-650 hover:border-gray-500 transition-colors"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-200">{entry.changedBy}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {new Date(entry.changedAt).toLocaleString('ru-RU')}
                  </div>
                </div>
                <div className="text-sm">
                  <span className={`font-medium ${action.color}`}>
                    {action.text}
                  </span>
                  {entry.fieldName && (
                    <span className="text-gray-300">: {entry.fieldName}</span>
                  )}
                  {entry.oldValue && entry.newValue && (
                    <div className="mt-2 text-xs">
                      {renderDiff(entry.oldValue, entry.newValue)}
                    </div>
                  )}
                  {!entry.fieldName && entry.newValue && (
                    <span className="text-gray-300">: {entry.newValue}</span>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-600 text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(entry.changedAt).toLocaleString('ru-RU')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
                <History className="w-6 h-6" />
                Детали изменения
              </h2>
              <button onClick={() => setSelectedEntry(null)} className="text-gray-400 hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Действие</p>
                <p className={`text-lg font-semibold ${getActionText(selectedEntry.action).color}`}>
                  {getActionText(selectedEntry.action).text}
                </p>
              </div>
              {selectedEntry.fieldName && (
                <div>
                  <p className="text-sm text-gray-400 mb-1">Поле</p>
                  <p className="text-gray-200 font-medium">{selectedEntry.fieldName}</p>
                </div>
              )}
              {selectedEntry.oldValue && selectedEntry.newValue && (
                <div>
                  <p className="text-sm text-gray-400 mb-2">Изменения</p>
                  <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    {renderDiff(selectedEntry.oldValue, selectedEntry.newValue)}
                  </div>
                </div>
              )}
              {!selectedEntry.oldValue && selectedEntry.newValue && (
                <div>
                  <p className="text-sm text-gray-400 mb-1">Значение</p>
                  <p className="text-gray-200 bg-gray-900 p-3 rounded-lg border border-gray-700">{selectedEntry.newValue}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Автор изменений</p>
                  <p className="text-gray-200 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {selectedEntry.changedBy}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400 mb-1">Дата и время</p>
                  <p className="text-gray-200 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(selectedEntry.changedAt).toLocaleString('ru-RU')}
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

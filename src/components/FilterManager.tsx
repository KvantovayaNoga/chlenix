import { useState } from 'react';
import { Save, Trash2, Plus, X } from 'lucide-react';

export interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, any>;
}

interface FilterManagerProps {
  currentFilters: Record<string, any>;
  savedFilters: SavedFilter[];
  onSaveFilter: (name: string, filters: Record<string, any>) => void;
  onLoadFilter: (filters: Record<string, any>) => void;
  onDeleteFilter: (id: string) => void;
}

export function FilterManager({ 
  currentFilters, 
  savedFilters, 
  onSaveFilter, 
  onLoadFilter, 
  onDeleteFilter 
}: FilterManagerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [filterName, setFilterName] = useState('');

  const handleSave = () => {
    if (!filterName.trim()) return;
    onSaveFilter(filterName.trim(), currentFilters);
    setFilterName('');
    setIsSaving(false);
  };

  return (
    <div className="bg-white dark:bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-800 dark:text-gray-800 dark:text-gray-200">Сохранённые фильтры</h3>
        <button
          onClick={() => setIsSaving(!isSaving)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Сохранить текущие
        </button>
      </div>

      {isSaving && (
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Название фильтра"
            className="flex-1 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-800 dark:text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
          <button
            onClick={handleSave}
            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
          >
            <Save className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              setIsSaving(false);
              setFilterName('');
            }}
            className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {savedFilters.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">Нет сохранённых фильтров</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {savedFilters.map((filter) => (
            <div
              key={filter.id}
              className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <button
                onClick={() => onLoadFilter(filter.filters)}
                className="flex-1 text-left text-sm text-gray-800 dark:text-gray-800 dark:text-gray-200 hover:text-indigo-400 transition-colors"
              >
                {filter.name}
              </button>
              <button
                onClick={() => onDeleteFilter(filter.id)}
                className="p-1 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Удалить фильтр"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

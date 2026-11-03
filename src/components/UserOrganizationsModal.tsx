import { useEffect, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import type { Organization, UserOrganizationRef } from '../types';

// ============================================================
// Модальное окно «Организации пользователя» (для администратора):
// добавить в любые организации или исключить из них. При смене
// активной организации (перенос) бэкенд инвалидирует сессии —
// пользователя разлогинит, и при следующем входе он попадёт
// в актуальную организацию.
// ============================================================
export function UserOrganizationsModal({ userId, userFullName, currentOrgs, onClose, onSaved }: {
  userId: string;
  userFullName: string;
  currentOrgs: UserOrganizationRef[];
  onClose: () => void;
  onSaved: (orgs: UserOrganizationRef[]) => void;
}) {
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<string[]>(currentOrgs.map(o => o.id));
  const [activeId, setActiveId] = useState<string | null>(currentOrgs.find(o => o.isActive)?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Organization[]>('/organizations').then(setAllOrgs).catch(() => setError('Не удалось загрузить список организаций'));
  }, []);

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    if (selected.includes(id) && activeId === id) setActiveId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await api.put<{ organizations: UserOrganizationRef[] }>(`/users/${userId}/organizations`, {
        organizationIds: selected,
        activeOrganizationId: activeId && selected.includes(activeId) ? activeId : null,
      });
      onSaved(res.organizations ?? []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: string) => allOrgs.find(o => o.id === id)?.name || '—';
  const willMove = (activeId ?? '') !== (currentOrgs.find(o => o.isActive)?.id ?? '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">Организации пользователя</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{userFullName}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Состав организаций</label>
            <div className="space-y-1.5 max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
              {allOrgs.length === 0 && <p className="text-sm text-gray-400 py-2 text-center">Загрузка…</p>}
              {allOrgs.map(org => (
                <label key={org.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-700 dark:text-gray-200">
                  <input type="checkbox" checked={selected.includes(org.id)} onChange={() => toggle(org.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="truncate" title={org.name}>{org.shortName || org.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Активная организация (последняя сессия)</label>
            <select value={activeId ?? ''} onChange={(e) => setActiveId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              <option value="">— не выбрана —</option>
              {selected.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
            {willMove && selected.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                При переносе в другую организацию активная сессия пользователя будет завершена (разлогин). Следующий вход выполнится в выбранную организацию.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Отмена</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

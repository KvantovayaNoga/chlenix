import { useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { Building2, Briefcase, MapPin, Server, Plus, Edit, Trash2, X, ListChecks, Library, Minus } from 'lucide-react';
import type { Department, Position, Branch, DataCenter, ActivityType, CustomDirectory } from '../types';

export function DirectoriesPage() {
  const { departments, positions, activityTypes, branches, dataCenters, customDirectories, addDepartment, updateDepartment, deleteDepartment, addPosition, updatePosition, deletePosition, addActivityType, updateActivityType, deleteActivityType, addBranch, updateBranch, deleteBranch, addDataCenter, updateDataCenter, deleteDataCenter, addCustomDirectory, updateCustomDirectory, deleteCustomDirectory } = useDataStore();
  // Права на справочники по ролям — зеркало canEditDirectory() с бэкенда:
  // admin — всё; hr_specialist — отделы/должности/филиалы (ЦОД только просмотр);
  // sysadmin — только ЦОД; внутренние справочники — эксклюзив администратора;
  // остальные — только просмотр.
  const { canEditDirectory } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'departments' | 'positions' | 'activity-types' | 'branches' | 'data-centers' | 'internal-directories'>('departments');
  const activeTabModel = activeTab === 'internal-directories' ? 'customDirectory' : activeTab === 'data-centers' ? 'dataCenter' : activeTab === 'branches' ? 'branch' : activeTab === 'activity-types' ? 'activityType' : activeTab === 'departments' ? 'department' : 'position';
  const canEditActive = canEditDirectory(activeTabModel);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Внутренние справочники: редактирование набора записей вынесено в отдельную
  // модалку (сущность + её items), а не в общий DirectoryModal
  const [editingDirectory, setEditingDirectory] = useState<CustomDirectory | null>(null);
  // Сообщение об ошибке/успехе прямо на странице (общий error из store может быть
  // перезаписан фоновыми операциями, поэтому перехватываем результат конкретной операции)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const tabs = [
    { id: 'departments' as const, label: 'Отделы', icon: Building2, count: departments.length },
    { id: 'positions' as const, label: 'Должности', icon: Briefcase, count: positions.length },
    { id: 'activity-types' as const, label: 'Виды деятельности', icon: ListChecks, count: activityTypes.length },
    { id: 'branches' as const, label: 'Филиалы', icon: MapPin, count: branches.length },
    { id: 'data-centers' as const, label: 'ЦОД', icon: Server, count: dataCenters.length },
    // Подкатегория «Справочники → Внутренние справочники»
    { id: 'internal-directories' as const, label: 'Внутренние справочники', icon: Library, count: customDirectories.length },
  ];

  const { error: storeError } = useDataStore();

  const showErr = (fallback: string) => {
    setFeedback({ type: 'error', text: storeError || fallback });
  };

  const handleAdd = async (data: any): Promise<boolean> => {
    let ok = false;
    if (activeTab === 'departments') ok = await addDepartment({ name: data.name.trim(), description: data.description?.trim() || null });
    else if (activeTab === 'positions') ok = await addPosition({ name: data.name.trim(), description: data.description?.trim() || null });
    else if (activeTab === 'activity-types') ok = await addActivityType({ okved: data.okved.trim(), name: data.name.trim(), isMain: Boolean(data.isMain) });
    else if (activeTab === 'branches') ok = await addBranch({ name: data.name.trim(), address: data.address?.trim() || '', description: data.description?.trim() || null });
    else if (activeTab === 'internal-directories') ok = await addCustomDirectory({ name: data.name.trim(), description: data.description?.trim() || null, items: (data.items ?? []).map((v: string) => v.trim()).filter(Boolean) });
    else ok = await addDataCenter({ name: data.name.trim(), owner: data.owner?.trim() || '', address: data.address?.trim() || null, description: data.description?.trim() || null });
    if (ok) {
      setFeedback({ type: 'success', text: 'Запись добавлена в справочник' });
      setShowAddModal(false);
    } else {
      showErr('Не удалось добавить запись. Проверьте, что вы авторизованы как администратор.');
    }
    return ok;
  };

  const handleEdit = async (item: any): Promise<boolean> => {
    let ok = false;
    if (activeTab === 'activity-types') {
      // Основной вид деятельности может быть ровно один. Если другой вид уже
      // помечен основным — изменения не применяются, пока с текущего основного
      // не снимут галочку «Основной вид деятельности» (модалка остаётся открытой).
      if (item.isMain && activityTypes.some(a => a.isMain && a.id !== item.id)) {
        return false;
      }
      return await updateActivityType(item.id, { okved: item.okved.trim(), name: item.name.trim(), isMain: Boolean(item.isMain) });
    }
    if (activeTab === 'internal-directories') {
      // Сохраняем и наименование/описание, и полный набор записей справочника
      return await updateCustomDirectory(item.id, { name: item.name.trim(), description: item.description?.trim() || null, items: (item.items ?? []).map((v: string) => v.trim()).filter(Boolean) });
    }
    const payload = { ...item, name: item.name.trim(), description: item.description?.trim() || null };
    if (activeTab === 'departments') ok = await updateDepartment(item.id, payload);
    else if (activeTab === 'positions') ok = await updatePosition(item.id, payload);
    else if (activeTab === 'branches') ok = await updateBranch(item.id, { ...payload, address: item.address?.trim() || '' });
    else ok = await updateDataCenter(item.id, { ...payload, owner: item.owner?.trim() || '', address: item.address?.trim() || null });
    if (ok) {
      setFeedback({ type: 'success', text: 'Изменения сохранены' });
      setEditingItem(null);
    } else {
      showErr('Не удалось сохранить изменения');
    }
    return ok;
  };

  const handleDelete = async (id: string) => {
    let ok = false;
    if (activeTab === 'departments') ok = await deleteDepartment(id);
    else if (activeTab === 'positions') ok = await deletePosition(id);
    else if (activeTab === 'activity-types') ok = await deleteActivityType(id);
    else if (activeTab === 'branches') ok = await deleteBranch(id);
    else if (activeTab === 'internal-directories') ok = await deleteCustomDirectory(id);
    else ok = await deleteDataCenter(id);
    if (!ok) showErr('Не удалось удалить запись (возможно, она используется в карточках сотрудников)');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200">Справочники</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Управление отделами, должностями, видами деятельности, филиалами, ЦОДами и внутренними справочниками</p>
        </div>
        {canEditActive && (
          <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
            <Plus className="w-5 h-5" />Добавить
          </button>
        )}
      </div>

      {/* Сообщение об ошибке/успехе */}
      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${feedback.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'}`}>
          <div className="flex items-center justify-between gap-4">
            <span>{feedback.text}</span>
            <button onClick={() => setFeedback(null)} className="shrink-0 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              <tab.icon className="w-5 h-5" />
              {tab.label}
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'departments' && (
            <div className="space-y-2">
              {departments.map(dept => (
                <div key={dept.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{dept.name}</p>
                      {dept.description && <p className="text-sm text-gray-600 dark:text-gray-400">{dept.description}</p>}
                    </div>
                  </div>
                  {canEditActive && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem(dept)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(dept.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="space-y-2">
              {positions.map(pos => (
                <div key={pos.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{pos.name}</p>
                      {pos.description && <p className="text-sm text-gray-600 dark:text-gray-400">{pos.description}</p>}
                    </div>
                  </div>
                  {canEditActive && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem(pos)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(pos.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'activity-types' && (
            <div className="space-y-2">
              {activityTypes.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Нет записей. Добавьте вид деятельности — основной или дополнительный (ОКВЭД и наименование). Справочник доступен администратору и специалисту по кадрам.</p>}
              {/* Основной вид всегда на первом месте: список приходит с сервера
                  отсортированным (isMain desc), локальная сортировка в store — зеркало */}
              {activityTypes.map(act => (
                <div key={act.id} className={`flex items-center justify-between p-4 rounded-lg ${act.isMain ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/60' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <ListChecks className={`w-5 h-5 shrink-0 ${act.isMain ? 'text-indigo-600 dark:text-indigo-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 dark:text-gray-200">
                        {act.name}
                        {act.isMain && <span className="ml-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-800/60 px-2 py-0.5 rounded-full align-middle">Основной</span>}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">ОКВЭД: {act.okved}</p>
                    </div>
                  </div>
                  {canEditActive && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setEditingItem(act)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(act.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'data-centers' && (
            <div className="space-y-2">
              {dataCenters.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Нет записей. Добавьте ЦОД — например, сторонний или облачный дата-центр, в котором размещены ваши вычислительные мощности.</p>}
              {dataCenters.map(dc => (
                <div key={dc.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Server className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{dc.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Владелец: {dc.owner}{dc.address ? ` · ${dc.address}` : ''}</p>
                      {dc.description && <p className="text-sm text-gray-500 dark:text-gray-500">{dc.description}</p>}
                    </div>
                  </div>
                  {canEditActive && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem(dc)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(dc.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'branches' && (
            <div className="space-y-2">
              {branches.map(branch => (
                <div key={branch.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{branch.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{branch.address}</p>
                    </div>
                  </div>
                  {canEditActive && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingItem(branch)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm('Удалить?')) handleDelete(branch.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Подкатегория «Внутренние справочники»: справочники, которые создаёт
              администратор и использует в дальнейшем. Запись справочника =
              наименование + набор значений (items). */}
          {activeTab === 'internal-directories' && (
            <div className="space-y-2">
              {customDirectories.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Нет внутренних справочников. Администратор может создать произвольный справочник (наименование + набор записей) — он будет использоваться в дальнейшем.</p>}
              {customDirectories.map(dir => (
                <div key={dir.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <Library className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 dark:text-gray-200">
                        {dir.name}
                        <span className="ml-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded-full align-middle">{dir.items.length}</span>
                      </p>
                      {dir.description && <p className="text-sm text-gray-600 dark:text-gray-400">{dir.description}</p>}
                      {dir.items.length > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {dir.items.slice(0, 5).map(i => i.value).join(', ')}{dir.items.length > 5 ? ` и ещё ${dir.items.length - 5}…` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  {canEditActive && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setEditingDirectory(dir)} className="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 p-1" title="Редактировать справочник и его записи"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm(`Удалить внутренний справочник «${dir.name}» вместе со всеми записями?`)) handleDelete(dir.id); }} className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || (editingItem && activeTab !== 'internal-directories')) && (
        <DirectoryModal
          key={editingItem ? `edit-${editingItem.id}` : 'add'}
          item={editingItem}
          type={activeTab}
          onClose={() => { setShowAddModal(false); setEditingItem(null); }}
          onSave={async (data: any) => {
            // модалка закрывается сама только при успехе — при ошибке данные остаются в форме
            if (editingItem) {
              const ok = await handleEdit({ ...editingItem, ...data });
              if (ok) setEditingItem(null);
              return ok;
            }
            return handleAdd(data);
          }}
        />
      )}

      {/* Модалка внутреннего справочника: наименование + описание + список записей */}
      {(showAddModal && activeTab === 'internal-directories') && (
        <CustomDirectoryModal
          key="add-directory"
          directory={null}
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            const ok = await handleAdd(data);
            if (ok) setShowAddModal(false);
            return ok;
          }}
        />
      )}
      {editingDirectory && (
        <CustomDirectoryModal
          key={`edit-directory-${editingDirectory.id}`}
          directory={editingDirectory}
          onClose={() => setEditingDirectory(null)}
          onSave={async (data) => {
            const ok = await handleEdit({ ...editingDirectory, name: data.name, description: data.description, items: data.items });
            if (ok) setEditingDirectory(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}

// Формат ОКВЭД: максимум 6 цифр, два разделителя в виде точек (например, 62.01.1).
const OKVED_RE = /^\d{1,2}(\.\d{1,2}){0,2}$/;

function DirectoryModal({ item, type, onClose, onSave }: { item: any; type: string; onClose: () => void; onSave: (data: any) => Promise<boolean> }) {
  const { activityTypes } = useDataStore();
  const [formData, setFormData] = useState(item || (type === 'activity-types' ? { okved: '', name: '', isMain: false } : { name: '', description: '', address: '', owner: '' }));
  const [saving, setSaving] = useState(false);
  // Внутренняя валидация (общий стиль проекта): после нажатия «Добавить/Сохранить»
  // обязательные поля подсвечиваются красной рамкой + инлайн-подсказка; если сущность
  // не может быть создана — модалка НЕ закрывается, данные сохраняются в форме.
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const nameErr = submitted && !String(formData.name ?? '').trim()
    ? 'Укажите наименование — запись без названия не создастся.' : null;
  const ownerErr = submitted && type === 'data-centers' && !String(formData.owner ?? '').trim()
    ? 'Для ЦОД обязательно укажите владельца.' : null;
  const addressErr = submitted && type === 'branches' && !String(formData.address ?? '').trim()
    ? 'Для филиала обязательно укажите адрес.' : null;
  const okvedErr = submitted && type === 'activity-types' && !OKVED_RE.test(String(formData.okved ?? '').trim())
    ? 'Некорректный ОКВЭД: максимум 6 цифр и два разделителя в виде точек (например, 62.01.1).' : null;
  // Основной вид деятельности может быть только один (правило зеркалит бэкенд).
  const mainConflict = type === 'activity-types' && Boolean(formData.isMain)
    && activityTypes.some(a => a.isMain && a.id !== item?.id);
  const errCls = 'border-red-400 dark:border-red-600 focus:ring-red-400';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setFormError(null);
    // Проверка обязательных полей: окно остаётся открытым, пока сущность реально не создана.
    if (type === 'activity-types') {
      if (!String(formData.name ?? '').trim() || !OKVED_RE.test(String(formData.okved ?? '').trim())) return;
      if (mainConflict) { setFormError('У организации не может быть 2 основных видов деятельности — сначала снимите отметку «Основной вид» с текущей записи.'); return; }
    } else {
      if (!String(formData.name ?? '').trim()) return;
      if (type === 'data-centers' && !String(formData.owner ?? '').trim()) return;
      if (type === 'branches' && !String(formData.address ?? '').trim()) return;
    }
    setSaving(true);
    const ok = await onSave(formData);
    // при неудаче оставляем модалку открытой с введёнными данными
    if (!ok) { setFormError('Не удалось сохранить запись. Проверьте соединение и попробуйте ещё раз.'); setSaving(false); }
  };

  const fieldCls = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200';

  return (
    <div className="modal-root fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">{item ? 'Редактировать' : 'Добавить'}</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {type === 'activity-types' ? (
            <>
              {/* Поля справочника «Виды деятельности»: ОКВЭД + Наименование */}
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ОКВЭД<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.okved || ''} onChange={(e) => setFormData(p => ({ ...p, okved: e.target.value }))} placeholder="Напр.: 62.01.1" maxLength={8} className={`${fieldCls} ${okvedErr ? errCls : ''}`} /></div>
              {okvedErr && <p className="text-xs text-red-500 mt-1">{okvedErr}</p>}
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Наименование вида деятельности<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.name || ''} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Разработка компьютерного программного обеспечения" className={`${fieldCls} ${nameErr ? errCls : ''}`} /></div>
              {nameErr && <p className="text-xs text-red-500 mt-1">{nameErr}</p>}
              <label className={`flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-700 dark:text-gray-300 ${mainConflict ? 'text-red-500' : ''}`}>
                <input type="checkbox" checked={Boolean(formData.isMain)} onChange={(e) => setFormData(p => ({ ...p, isMain: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer" />
                Является основным видом деятельности
              </label>
              {mainConflict && <p className="text-xs text-red-500 -mt-2">У организации уже есть основной вид деятельности — снимите отметку с него или уберите галочку здесь.</p>}
              <p className="text-xs text-gray-500 dark:text-gray-400">Основной вид может быть только один — он встанет на первое место в справочнике.</p>
            </>
          ) : (
            <>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} className={`${fieldCls} ${nameErr ? errCls : ''}`} /></div>
          {nameErr && <p className="text-xs text-red-500 -mt-2">{nameErr}</p>}
          {type === 'data-centers' && (<div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Владелец<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={formData.owner || ''} onChange={(e) => setFormData(p => ({ ...p, owner: e.target.value }))} placeholder="Напр.: ООО «Облако», сторонний провайдер" className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${ownerErr ? errCls : ''}`} />
            {ownerErr && <p className="text-xs text-red-500 mt-1">{ownerErr}</p>}</div>)}
          {(type === 'branches' || type === 'data-centers') && (<div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Адрес{type === 'branches' ? <span className="text-red-500 ml-0.5" title="Обязательное поле">*</span> : null}</label><input type="text" value={formData.address || ''} onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))} className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${addressErr ? errCls : ''}`} />
            {addressErr && <p className="text-xs text-red-500 mt-1">{addressErr}</p>}</div>)}
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание</label><textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" rows={3} /></div>
            </>
          )}
          {formError && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {formError}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">Отмена</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed">{saving ? 'Сохранение…' : item ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Модалка внутреннего справочника (подкатегория «Внутренние справочники»)
// Наименование + описание + редактируемый набор записей (items).
// Доступ на сохранение — только администратор (проверяется и на бэкенде).
// ============================================================
function CustomDirectoryModal({ directory, onClose, onSave }: {
  directory: CustomDirectory | null;
  onClose: () => void;
  onSave: (data: { name: string; description: string | null; items: string[] }) => Promise<boolean>;
}) {
  const [name, setName] = useState(directory?.name ?? '');
  const [description, setDescription] = useState(directory?.description ?? '');
  const [items, setItems] = useState<string[]>(directory ? directory.items.map(i => i.value) : []);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // Внутренняя валидация: обязательные поля подсвечиваются красной рамкой +
  // инлайн-подсказка; при ошибке модалка остаётся открытой с введёнными данными.
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const nameErr = submitted && !name.trim() ? 'Укажите наименование внутреннего справочника.' : null;

  const addItem = () => {
    const v = draft.trim();
    if (!v) return;
    // значения уникальны внутри справочника (зеркало бэкенда)
    if (!items.some(x => x.toLowerCase() === v.toLowerCase())) setItems(prev => [...prev, v]);
    setDraft('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setFormError(null);
    if (!name.trim()) return;
    // незакоммиченное значение из поля ввода добавляем в список
    const finalItems = [...items];
    const d = draft.trim();
    if (d && !finalItems.some(x => x.toLowerCase() === d.toLowerCase())) finalItems.push(d);
    setSaving(true);
    const ok = await onSave({ name, description: description.trim() || null, items: finalItems });
    // при неудаче оставляем модалку открытой с введёнными данными
    if (!ok) { setFormError('Не удалось сохранить справочник. Проверьте соединение и попробуйте ещё раз.'); setSaving(false); }
  };

  const fieldCls = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200';

  return (
    <div className="modal-root fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">{directory ? 'Редактировать внутренний справочник' : 'Новый внутренний справочник'}</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Наименование<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр.: Инвентарные группы" className={`${fieldCls} ${nameErr ? 'border-red-400 dark:border-red-600 focus:ring-red-400' : ''}`} autoFocus /></div>
          {nameErr && <p className="text-xs text-red-500 -mt-2">{nameErr}</p>}
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание</label><textarea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} className={fieldCls} rows={2} placeholder="Для чего будет использоваться справочник" /></div>

          {/* Набор записей справочника */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Записи справочника</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                placeholder="Новая запись и Enter"
                className={fieldCls}
              />
              <button type="button" onClick={addItem} className="shrink-0 px-3 py-2 border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><Plus className="w-4 h-4" /></button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-2 text-center border border-dashed border-gray-200 dark:border-gray-600 rounded-lg">Записей пока нет — добавьте значения по одной</p>
            ) : (
              <ul className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                {items.map((v, idx) => (
                  <li key={`${v}-${idx}`} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{v}</span>
                    <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400"><Minus className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">Отмена</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed">{saving ? 'Сохранение…' : directory ? 'Сохранить' : 'Создать справочник'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

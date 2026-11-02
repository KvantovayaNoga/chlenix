// ============================================================
// ClusterForm — отдельная форма создания/редактирования кластера.
// Кластер виртуализации — логическая сущность, поэтому в форме нет
// полей физической инвентарной карточки (серийный номер, инвентарный
// номер, бренд, модель). Состав кластера формируется выбором из уже
// зарегистрированных хостов, СХД и консолей управления; если физической
// инфраструктуры нет, можно отметить «Нет хостов» / «Нет СХД» и внести
// количество ядер, ОЗУ и объём хранилища вручную.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { X, Server, HardDrive, TerminalSquare, Layers } from 'lucide-react';
import type { Branch, DataCenter, Equipment } from '../types';
import {
  normalizeClusterPayload,
  storageTypeLabels,
  formatGB,
  type ClusterManualResources,
} from '../utils/virtualization';
import { DecimalInput } from './DecimalInput';
import { StorageField } from './StorageField';
import { EmployeeSearch } from './EmployeeSearch';

/**
 * LocationSelect — единый выбор места размещения: филиалы организации И ЦОД
 * (справочник сторонних/облачных мощностей) в одном выпадающем списке с
 * группировкой. Виртуализация может жить как на филиале (своя серверная),
 * так и на арендованных/облачных мощностях. Значение — { branchId } или
 * { dataCenterId } (ровно одно из двух).
 */
export function LocationSelect({
  branches,
  dataCenters,
  allowDataCenters = true,
  branchId,
  dataCenterId,
  onChange,
  label = 'Место размещения *',
}: {
  branches: Branch[];
  dataCenters: DataCenter[];
  /** ЦОД доступны для любой инфраструктурной техники (кластеры и физические
   *  серверы — виртуализация может жить на арендованных/облачных мощностях). */
  allowDataCenters?: boolean;
  branchId: string;
  dataCenterId: string;
  onChange: (v: { branchId: string; dataCenterId: string }) => void;
  label?: string;
}) {
  const cls = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200';
  // Текущее значение кодируем префиксом, чтобы филиал и ЦОД могли сосуществовать в одном select
  const value = dataCenterId ? `dc:${dataCenterId}` : branchId ? `br:${branchId}` : '';
  const handleChange = (next: string) => {
    if (next.startsWith('br:')) onChange({ branchId: next.slice(3), dataCenterId: '' });
    else if (next.startsWith('dc:')) onChange({ branchId: '', dataCenterId: next.slice(3) });
    else onChange({ branchId: '', dataCenterId: '' });
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <select value={value} onChange={(e) => handleChange(e.target.value)} className={cls} required>
        <option value="">Выберите место размещения</option>
        <optgroup label="Филиалы">
          {branches.map((b) => <option key={`br-${b.id}`} value={`br:${b.id}`}>{b.name}</option>)}
        </optgroup>
        {allowDataCenters && (
          <optgroup label="ЦОД / облачные мощности">
            {dataCenters.length === 0 ? (
              <option disabled value="">ЦОД не заведены (справочник «ЦОД»)</option>
            ) : (
              dataCenters.map((d) => <option key={`dc-${d.id}`} value={`dc:${d.id}`}>{d.name}</option>)
            )}
          </optgroup>
        )}
      </select>
    </div>
  );
}

interface Props {
  /** Существующий кластер (Equipment c serverRole === 'cluster') или null — создание */
  cluster: Equipment | null;
  branches: Branch[];
  dataCenters: DataCenter[];
  allEquipment: Equipment[];
  onClose: () => void;
  /**
   * Сохранение кластера. `members` — полный список id участников после применения
   * формы; сервер атомарно привязывает новых («добавить железо») и отвязывает
   * снятых («удалить старое железо»). Вернёт false, чтобы не закрывать форму при ошибке.
   */
  onSave: (payload: Record<string, any>, members: string[]) => Promise<boolean | void> | boolean | void;
}

/** Чекбокс-список единиц оборудования (хосты / СХД / консоли управления) */
function MemberPicker({
  title,
  icon,
  items,
  selected,
  onToggle,
  emptyHint,
}: {
  title: string;
  icon: React.ReactNode;
  items: Equipment[];
  selected: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  emptyHint: string;
}) {
  // Отдельно показываем «новое» железо (ещё не в кластере) и текущих участников —
  // так при редактировании сразу видно, что добавляется и что можно снять.
  const newCount = items.filter((it) => !selected.has(it.id)).length;
  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
        {icon}
        {title}
        <span className="ml-auto text-[11px] font-normal text-gray-400 dark:text-gray-500">
          выбрано {selected.size}{newCount > 0 ? `, доступно ${newCount}` : ''}
        </span>
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{emptyHint}</p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {items.map((it) => {
            const isSelected = selected.has(it.id);
            return (
              <label key={it.id} className={`flex items-center gap-2 text-sm cursor-pointer select-none rounded-md px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSelected ? 'bg-purple-50/60 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200' : 'text-gray-700 dark:text-gray-300'}`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600"
                  checked={isSelected}
                  onChange={(e) => onToggle(it.id, e.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                {!isSelected && (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 shrink-0">новое</span>
                )}
                {it.serverRole === 'storage' && (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                    {it.storageType ? storageTypeLabels[it.storageType] : ''} • {formatGB(it.storageCapacityGB || it.diskGB || 0)}
                  </span>
                )}
                {it.serverRole === 'hypervisor_host' && (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                    {it.cpuCores || '?'} CPU / {it.ramGB || '?'} ГБ
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ClusterForm({ cluster, branches, dataCenters, allEquipment, onClose, onSave }: Props) {
  const isEdit = !!cluster;
  // Участники кластера берём из уже сохранённых связей parentClusterId
  const initialMembers = useMemo(
    () => new Set(allEquipment.filter((eq) => eq.parentClusterId === cluster?.id).map((eq) => eq.id)),
    [allEquipment, cluster?.id],
  );
  // При редактировании «ручные» ресурсы — это cpuCores/ramGB/storageCapacityGB самого кластера
  const initialNoHosts = isEdit ? cluster!.cpuCores != null || cluster!.ramGB != null : false;
  const initialNoStorage = isEdit ? cluster!.storageCapacityGB != null : false;

  const [formData, setFormData] = useState({
    name: cluster?.name || '',
    clusterName: cluster?.clusterName || '',
    hypervisorName: cluster?.hypervisorName || '',
    hypervisorVersion: cluster?.hypervisorVersion || '',
    branchId: cluster?.branchId || '',
    dataCenterId: cluster?.dataCenterId || '',
    floor: cluster?.floor || '',
    room: cluster?.room || '',
    assignedToEmployeeId: cluster?.assignedToEmployeeId || null,
    notes: cluster?.notes || '',
    noHosts: initialNoHosts,
    noStorage: initialNoStorage,
  });
  const [manual, setManual] = useState<ClusterManualResources>({
    cpuCores: cluster?.cpuCores ?? null,
    ramGB: cluster?.ramGB ?? null,
    storageCapacityGB: cluster?.storageCapacityGB ?? null,
  });
  const [members, setMembers] = useState<Set<string>>(initialMembers);

  // Если страница пересобрала список оборудования (например, после сохранения),
  // подтягиваем актуальный состав кластера, чтобы форма не работала по устаревшим связям.
  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  // Кандидаты в состав: только единицы с соответствующей ролью, сам кластер исключён.
  // Чужие участники (состоят в другом кластере) не предлагаются — бэкенд их всё
  // равно не привяжет, а перенос делается через карточку самого железа.
  const hosts = allEquipment.filter((eq) => eq.serverRole === 'hypervisor_host' && eq.id !== cluster?.id && (!eq.parentClusterId || eq.parentClusterId === cluster?.id));
  const storages = allEquipment.filter((eq) => eq.serverRole === 'storage' && eq.id !== cluster?.id && (!eq.parentClusterId || eq.parentClusterId === cluster?.id));
  const consoles = allEquipment.filter((eq) => eq.serverRole === 'management_console' && eq.id !== cluster?.id && (!eq.parentClusterId || eq.parentClusterId === cluster?.id));

  const toggleMember = (id: string, checked: boolean) => {
    setMembers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = normalizeClusterPayload({ ...formData }, Array.from(members), manual);
    const membersList = payload.__members;
    delete payload.__members;
    onSave(payload as any, membersList);
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-600" />
            {isEdit ? 'Редактировать кластер' : 'Новый кластер'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Основное: кластер — логическая сущность, без инвентарной карточки */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Наименование кластера *</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="Например: HA-Cluster-01" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Имя кластера в гипервизоре</label>
              <input type="text" value={formData.clusterName} onChange={(e) => setFormData((p) => ({ ...p, clusterName: e.target.value }))} className={inputCls} placeholder="Совпадает с наименованием, если не указано" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Гипервизор / платформа</label>
              {/* Ввод только руками: подсказки популярных платформ выводятся placeholder'ом,
                  выпадающего списка нет — платформы бывают произвольными (в т.ч. облачные) */}
              <input type="text" value={formData.hypervisorName} onChange={(e) => setFormData((p) => ({ ...p, hypervisorName: e.target.value }))} className={inputCls} placeholder="Например: VMware vSphere / ESXi, Proxmox VE, Яндекс Облако…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Версия гипервизора</label>
              <input type="text" value={formData.hypervisorVersion} onChange={(e) => setFormData((p) => ({ ...p, hypervisorVersion: e.target.value }))} className={inputCls} placeholder="vSphere 8.0 U2, PVE 8.2…" />
            </div>
            <LocationSelect
              branches={branches}
              dataCenters={dataCenters}
              allowDataCenters
              branchId={formData.branchId}
              dataCenterId={formData.dataCenterId}
              onChange={({ branchId, dataCenterId }) => setFormData((p) => ({ ...p, branchId, dataCenterId }))}
              label="Филиал / ЦОД *"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Кабинет/помещение</label>
              <input type="text" value={formData.room} onChange={(e) => setFormData((p) => ({ ...p, room: e.target.value }))} className={inputCls} placeholder="Серверная (необязательно)" />
            </div>
          </div>

          {/* Состав кластера: выбор из существующих хостов, СХД и консолей управления */}
          <div className="border border-purple-100 dark:border-purple-900/50 rounded-xl p-4 bg-purple-50/40 dark:bg-purple-900/10 space-y-3">
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Состав кластера</p>
            <MemberPicker
              title="Хосты гипервизора"
              icon={<Server className="w-4 h-4 text-red-500" />}
              items={hosts}
              selected={members}
              onToggle={toggleMember}
              emptyHint="Хосты не зарегистрированы — отметьте «Нет хостов» и укажите ресурсы вручную."
            />
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-purple-600" checked={formData.noHosts} onChange={(e) => setFormData((p) => ({ ...p, noHosts: e.target.checked }))} />
              <span className="text-sm text-gray-700 dark:text-gray-300">Нет хостов — внести ядра и ОЗУ вручную</span>
            </label>
            {formData.noHosts && (
              <div className="grid grid-cols-2 gap-4 pl-6">
                <DecimalInput label="CPU (ядер, суммарно)" value={manual.cpuCores} onChange={(v) => setManual((m) => ({ ...m, cpuCores: v }))} placeholder="Например: 64" min={1} />
                <DecimalInput label="RAM (ГБ, суммарно)" value={manual.ramGB} onChange={(v) => setManual((m) => ({ ...m, ramGB: v }))} placeholder="Например: 256 или 128,5" min={0.001} />
              </div>
            )}

            <MemberPicker
              title="СХД"
              icon={<HardDrive className="w-4 h-4 text-cyan-500" />}
              items={storages}
              selected={members}
              onToggle={toggleMember}
              emptyHint="СХД не зарегистрированы — отметьте «Нет СХД» и укажите объём вручную."
            />
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-purple-600" checked={formData.noStorage} onChange={(e) => setFormData((p) => ({ ...p, noStorage: e.target.checked }))} />
              <span className="text-sm text-gray-700 dark:text-gray-300">Нет СХД — внести объём хранилища вручную</span>
            </label>
            {formData.noStorage && (
              <div className="pl-6">
                <StorageField
                  label="Объём хранилища"
                  valueGB={manual.storageCapacityGB}
                  onChange={(gb) => setManual((m) => ({ ...m, storageCapacityGB: gb }))}
                  placeholder="Например: 48 или 12,5"
                  hint="Объём хранится в системе в ГБ; выбирайте удобную единицу (КБ…ПБ)."
                />
              </div>
            )}

            <MemberPicker
              title="Консоли управления"
              icon={<TerminalSquare className="w-4 h-4 text-amber-500" />}
              items={consoles}
              selected={members}
              onToggle={toggleMember}
              emptyHint="Консоли управления не зарегистрированы (поле необязательное)."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isEdit
                ? 'Редактирование состава: поставьте галочку, чтобы добавить новое железо в кластер, снимите — чтобы убрать его из кластера (саму единицу оборудования это не удалит). Изменения применятся после сохранения.'
                : 'Выбранные единицы будут привязаны к этому кластеру. После создания состав можно изменить — для этого откройте карточку кластера повторно.'}
            </p>
          </div>

          <EmployeeSearch
            value={formData.assignedToEmployeeId}
            onChange={(id) => setFormData((p) => ({ ...p, assignedToEmployeeId: id }))}
            label="Ответственный"
            placeholder="Поиск сотрудника..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания</label>
            <textarea value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} className={inputCls} rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Отмена</button>
            <button type="submit" className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700">{isEdit ? 'Сохранить' : 'Создать кластер'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ClusterForm;

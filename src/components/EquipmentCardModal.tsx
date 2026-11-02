// Модальная карточка оборудования: просмотр подробной информации об единице
// техники, не покидая текущую вкладку (например, из «Сотрудники → Закреплённое
// имущество»). Внутри — кнопка «Редактировать», открывающая форму редактирования
// поверх просмотрщика (ServerModal для серверов виртуализации, ClusterForm для
// кластеров, EquipmentModal для остального).
import { useState } from 'react';
import { X, Pencil, Monitor, Server, MousePointerClick, Armchair, Cpu, Network, Phone, Database, Package, Unlink, MapPin, Calendar, User, Building, Layers } from 'lucide-react';
import type { Equipment, EquipmentCategory } from '../types';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { EquipmentModalWrapper } from '../pages/EquipmentPage';
import { ServerEditModal, ClusterEditModal } from '../pages/PhysicalServersPage';

const categoryLabels: Record<EquipmentCategory, string> = {
  computer: 'Компьютер', monitor: 'Монитор', peripheral: 'Периферия', furniture: 'Мебель',
  server: 'Сервер', virtual_machine: 'ВМ', network: 'Сеть', phone: 'Телефон', storage: 'СХД', other: 'Прочее',
};
const categoryIcons: Record<EquipmentCategory, React.ElementType> = {
  computer: Monitor, monitor: Monitor, peripheral: MousePointerClick, furniture: Armchair,
  server: Server, virtual_machine: Cpu, network: Network, phone: Phone, storage: Database, other: Package,
};
const conditionLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Новое', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  good: { label: 'Хорошее', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  satisfactory: { label: 'Удовлетворительное', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  needs_repair: { label: 'Требует ремонта', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  written_off: { label: 'Списано', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
};
const serverRoleLabels: Record<string, string> = {
  hypervisor_host: 'Хост гипервизора', storage: 'СХД', management_console: 'Консоль управления', cluster: 'Кластер', standalone: 'Автономный сервер',
};

function Row({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
        <p className="text-sm text-gray-700 dark:text-gray-200 break-words">{value}</p>
      </div>
    </div>
  );
}

export function EquipmentCardModal({ equipmentId, onClose }: { equipmentId: string; onClose: () => void }) {
  const { getEquipmentById, branches, dataCenters, unassignEquipment, employees } = useDataStore();
  // МОЛ: в карточке оборудования доступна только связка — кнопка «Открепить».
  // Редактирование карточки (canEdit) — строго admin.
  const { canEdit, isAdmin, currentUser } = useAuthStore();
  const canAssign = isAdmin() || currentUser?.role === 'materially_responsible';
  const [editing, setEditing] = useState(false);

  // Держим актуальную версию объекта: после сохранения формы store обновится.
  const eq = getEquipmentById(equipmentId);
  if (!eq) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">Оборудование не найдено (возможно, удалено).</p>
          <button onClick={onClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm">Закрыть</button>
        </div>
      </div>
    );
  }

  const Icon = categoryIcons[eq.category] ?? Package;
  const condition = conditionLabels[eq.condition];
  const employee = eq.assignedToEmployee
    ? [eq.assignedToEmployee.lastName, eq.assignedToEmployee.firstName, eq.assignedToEmployee.middleName].filter(Boolean).join(' ')
    : employees.find((e) => e.id === eq.assignedToEmployeeId)?.lastName ?? null;
  const branch = branches.find((b) => b.id === eq.branchId)?.name ?? null;
  const dc = (dataCenters ?? []).find((d: any) => d.id === eq.dataCenterId)?.name ?? null;
  const isCluster = eq.serverRole === 'cluster';
  const isVirtualizationServer = eq.category === 'server' && !!eq.serverRole;

  const fmtGb = (gb: number | null | undefined) => {
    if (gb == null) return null;
    if (gb >= 1024 * 1024) return `${(gb / 1024 / 1024).toLocaleString('ru-RU')} ПБ`;
    if (gb >= 1024) return `${(gb / 1024).toLocaleString('ru-RU')} ТБ`;
    return `${gb.toLocaleString('ru-RU')} ГБ`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-2.5 rounded-lg shrink-0"><Icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 truncate">{eq.name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{categoryLabels[eq.category]}{eq.serverRole ? ` • ${serverRoleLabels[eq.serverRole] ?? eq.serverRole}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit() && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                title="Редактировать оборудование"
              >
                <Pencil className="w-4 h-4" /> Редактировать
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" title="Закрыть"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {condition && <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${condition.color}`}>{condition.label}</span>}
            {employee ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 inline-flex items-center gap-1"><User className="w-3 h-3" /> Закреплено: {employee}</span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Не закреплено</span>
            )}
            {eq.writeOffDate && <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Списано {new Date(eq.writeOffDate).toLocaleDateString('ru-RU')}</span>}
          </div>

          <div className="divide-y divide-gray-50 dark:divide-gray-700/60">
            {/* Инвентарные поля — только для физической техники (кластер — логическая сущность) */}
            {!isCluster && (
              <>
                <Row icon={Layers} label="Инвентарный номер" value={eq.inventoryNumber || '—'} />
                <Row icon={Layers} label="Серийный номер" value={eq.serialNumber || '—'} />
                <Row label="Производитель / модель" value={[eq.brand, eq.model].filter(Boolean).join(' ') || '—'} />
              </>
            )}
            <Row icon={MapPin} label="Размещение" value={dc ? `ЦОД: ${dc}` : branch ? `${branch}${eq.floor ? `, этаж ${eq.floor}` : ''}${eq.room ? `, к. ${eq.room}` : ''}` : '—'} />
            <Row icon={Calendar} label="Дата покупки" value={eq.purchaseDate ? new Date(eq.purchaseDate).toLocaleDateString('ru-RU') : '—'} />

            {(eq.cpuCores != null || eq.ramGB != null || eq.diskGB != null) && (
              <Row icon={Cpu} label="Ресурсы" value={[
                eq.cpuCores != null ? `${eq.cpuCores} ядер` : null,
                eq.ramGB != null ? `${eq.ramGB} ГБ ОЗУ` : null,
                eq.diskGB != null ? `${fmtGb(eq.diskGB)} диск` : null,
              ].filter(Boolean).join(' • ')} />
            )}

            {isCluster && (
              <Row icon={Network} label="Гипервизор / платформа" value={[eq.hypervisorName, eq.hypervisorVersion].filter(Boolean).join(' ') || '—'} />
            )}
            {eq.serverRole === 'hypervisor_host' && (
              <Row icon={Server} label="Хост" value={[eq.hypervisorName, eq.hypervisorVersion].filter(Boolean).join(' ') || '—'} />
            )}
            {eq.serverRole === 'storage' && (
              <Row icon={Database} label="СХД" value={[
                eq.storageType, eq.storageProtocol, eq.storageCapacityGB != null ? fmtGb(eq.storageCapacityGB) : null,
              ].filter(Boolean).join(' • ') || '—'} />
            )}
            {eq.parentClusterId && <ParentClusterRow parentId={eq.parentClusterId} />}

            {eq.notes && <Row label="Примечания" value={eq.notes} />}
            <Row icon={Building} label="Учёт" value={`Создано: ${new Date(eq.createdAt).toLocaleDateString('ru-RU')} • Обновлено: ${new Date(eq.updatedAt).toLocaleDateString('ru-RU')}`} />
          </div>

          {canAssign && eq.assignedToEmployeeId && !editing && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => { unassignEquipment(eq.id); }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 transition-colors"
                title="Открепить от сотрудника"
              >
                <Unlink className="w-4 h-4" /> Открепить
              </button>
            </div>
          )}
        </div>
      </div>

      {editing && (
        isCluster ? (
          <ClusterEditModal cluster={eq} onClose={() => setEditing(false)} />
        ) : isVirtualizationServer ? (
          <ServerEditModal server={eq} onClose={() => setEditing(false)} />
        ) : (
          <EquipmentModalWrapper equipment={eq} onClose={() => setEditing(false)} />
        )
      )}
    </div>
  );
}

function ParentClusterRow({ parentId }: { parentId: string }) {
  const { getEquipmentById } = useDataStore();
  const parent = getEquipmentById(parentId);
  if (!parent) return null;
  return <Row icon={Server} label="Входит в кластер" value={parent.name} />;
}

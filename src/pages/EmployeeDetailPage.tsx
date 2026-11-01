import { useParams, useNavigate } from '../router';
import { useDataStore } from '../store/dataStore';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, Mail, Phone, Building, MapPin, Calendar, Monitor, Server, Armchair, MousePointerClick, Network, Package, Unlink, Cpu, Globe, User, PhoneCall, Plus, X, Pencil } from 'lucide-react';
import type { EquipmentCategory } from '../types';
import { useState } from 'react';
import { AddEmployeeModal } from './EmployeesPage';

const categoryLabels: Record<EquipmentCategory, string> = {
  computer: 'Компьютер', monitor: 'Монитор', peripheral: 'Периферия', furniture: 'Мебель',
  server: 'Сервер', virtual_machine: 'ВМ', network: 'Сеть', phone: 'Телефон', other: 'Прочее',
};
const categoryIcons: Record<EquipmentCategory, React.ElementType> = {
  computer: Monitor, monitor: Monitor, peripheral: MousePointerClick, furniture: Armchair,
  server: Server, virtual_machine: Cpu, network: Network, phone: Phone, other: Package,
};
const conditionLabels = {
  new: { label: 'Новое', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  good: { label: 'Хорошее', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  satisfactory: { label: 'Удовлетворительное', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  needs_repair: { label: 'Требует ремонта', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  written_off: { label: 'Списано', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
};
const vmStatusLabels = {
  running: { label: 'Запущена', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  stopped: { label: 'Остановлена', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  maintenance: { label: 'Обслуживание', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  decommissioned: { label: 'Выведена', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

export function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getEmployeeById, getEquipmentByEmployee, getVMsByResponsible, unassignEquipment, assignEquipment, getUnassignedEquipment, departments, positions, branches, updateEmployee } = useDataStore();
  const { canEdit, users } = useAuthStore();
  const [showAssignEquipmentModal, setShowAssignEquipmentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const employee = getEmployeeById(id || '');
  const employeeEquipment = getEquipmentByEmployee(id || '');
  const employeeVMs = getVMsByResponsible(id || '');

  if (!employee) {
    return <div className="text-center py-12"><p className="text-gray-500 dark:text-gray-400">Сотрудник не найден</p><button onClick={() => navigate('/employees')} className="mt-4 text-indigo-600 dark:text-indigo-400 hover:underline">Вернуться</button></div>;
  }

  const getUserName = (userId: string | null) => {
    if (!userId) return '—';
    const user = users.find(u => u.id === userId);
    return user?.fullName || 'Неизвестный';
  };
  const getDeptName = () => departments.find(d => d.id === employee.departmentId)?.name || '—';
  const getPosName = () => positions.find(p => p.id === employee.positionId)?.name || '—';
  const getBranchName = () => branches.find(b => b.id === employee.branchId)?.name || '—';

  return (
    <div>
      <button onClick={() => navigate('/employees')} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6"><ArrowLeft className="w-5 h-5" /><span>Назад</span></button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="text-center mb-6 relative">
              {canEdit() && (
                <button onClick={() => setShowEditModal(true)} className="absolute right-0 top-0 flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors" title="Редактировать карточку">
                  <Pencil className="w-4 h-4" />Изменить
                </button>
              )}
              <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold ${employee.isEmployed ? 'bg-indigo-500' : 'bg-gray-400'}`}>{employee.lastName.charAt(0)}{employee.firstName.charAt(0)}</div>
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mt-4">{employee.lastName} {employee.firstName} {employee.middleName}</h2>
              <p className="text-gray-600 dark:text-gray-400">{getPosName()}</p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${employee.isEmployed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{employee.isEmployed ? 'Работает' : 'Уволен'}</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400"><Building className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{getDeptName()}</span></div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400"><Mail className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{employee.email}</span></div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400"><Phone className="w-4 h-4 text-gray-400 dark:text-gray-500" /><div><p>{employee.workPhone}</p><p className="text-xs text-gray-500 dark:text-gray-500">Внутр.: {employee.internalPhone}</p></div></div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400"><PhoneCall className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>{employee.personalPhone}</span></div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400"><MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500" /><div><p>{getBranchName()}</p><p className="text-xs text-gray-500 dark:text-gray-500">{employee.floor && `Этаж ${employee.floor}, `}Кабинет {employee.room}</p></div></div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400"><Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span>Принят: {new Date(employee.hireDate).toLocaleDateString('ru-RU')}</span></div>
            </div>
            {employee.notes && <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400"><p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Примечания:</p><p>{employee.notes}</p></div>}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-500 space-y-1">
              <p>Создано: {new Date(employee.createdAt).toLocaleString('ru-RU')}</p>
              <p>Обновлено: {new Date(employee.updatedAt).toLocaleString('ru-RU')}</p>
              <p>Обновил: {getUserName(employee.updatedBy)}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Закреплённое имущество ({employeeEquipment.length})</h3>
              {canEdit() && (
                <button 
                  onClick={() => setShowAssignEquipmentModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                  title="Добавить оборудование"
                >
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              )}
            </div>
            {employeeEquipment.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500"><Monitor className="w-12 h-12 mx-auto mb-2" /><p>Нет закреплённого имущества</p></div>
            ) : (
              <div className="space-y-3">
                {employeeEquipment.map(eq => {
                  const Icon = categoryIcons[eq.category];
                  const condition = conditionLabels[eq.condition];
                  return (
                    <div key={eq.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="bg-white dark:bg-gray-600 p-2 rounded-lg shadow-sm"><Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /></div>
                        <div>
                          <p className="font-medium text-gray-700 dark:text-gray-200">{eq.name}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{categoryLabels[eq.category]} • Инв. №{eq.inventoryNumber} • Сер. №{eq.serialNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${condition.color}`}>{condition.label}</span>
                        {canEdit() && <button onClick={() => unassignEquipment(eq.id)} className="text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 p-1" title="Открепить"><Unlink className="w-4 h-4" /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4">Виртуальные машины ({employeeVMs.length})</h3>
            {employeeVMs.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500"><Cpu className="w-12 h-12 mx-auto mb-2" /><p>Нет связанных ВМ</p></div>
            ) : (
              <div className="space-y-3">
                {employeeVMs.map(vm => {
                  const status = vmStatusLabels[vm.status];
                  const isInfra = vm.responsibleEmployeeId === id;
                  return (
                    <div key={vm.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          <span className="font-medium text-gray-700 dark:text-gray-200">{vm.name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>{status.label}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">{isInfra ? 'Инфраструктура' : 'Сервисы'}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mt-2">
                        <p>ОС: {vm.os}</p>
                        <p>CPU: {vm.cpuCores} ядер, RAM: {vm.ramGB} ГБ</p>
                        {vm.networkInterfaces.map(ni => (
                          <div key={ni.id} className="flex items-center gap-1">
                            {ni.isPublic ? <Globe className="w-3 h-3 text-orange-500 dark:text-orange-400" /> : <Network className="w-3 h-3 text-gray-400 dark:text-gray-500" />}
                            <span className="font-mono">{ni.ipAddress}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditModal && employee && (
        <AddEmployeeModal
          initial={employee}
          onClose={() => setShowEditModal(false)}
          onAdd={(data) => { updateEmployee(employee.id, data as any); setShowEditModal(false); }}
        />
      )}

      {showAssignEquipmentModal && employee && (
        <AssignEquipmentModal
          employeeId={employee.id}
          onClose={() => setShowAssignEquipmentModal(false)}
          onAssign={(equipmentId) => {
            assignEquipment(equipmentId, employee.id);
            setShowAssignEquipmentModal(false);
          }}
        />
      )}
    </div>
  );
}

function AssignEquipmentModal({ employeeId, onClose, onAssign }: { employeeId: string; onClose: () => void; onAssign: (equipmentId: string) => void }) {
  const { getUnassignedEquipment } = useDataStore();
  const [searchQuery, setSearchQuery] = useState('');
  const unassignedEquipment = getUnassignedEquipment();

  const filteredEquipment = unassignedEquipment.filter(eq => {
    const q = searchQuery.toLowerCase();
    return !q || 
      eq.name.toLowerCase().includes(q) ||
      eq.serialNumber.toLowerCase().includes(q) ||
      eq.inventoryNumber.toLowerCase().includes(q) ||
      eq.brand.toLowerCase().includes(q) ||
      eq.model.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-gray-200">Выберите оборудование для закрепления</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию, серийному номеру, бренду..."
              className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredEquipment.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Нет доступного оборудования для закрепления</p>
              </div>
            ) : (
              filteredEquipment.map(eq => (
                <div
                  key={eq.id}
                  onClick={() => onAssign(eq.id)}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg cursor-pointer transition-colors border border-gray-600"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-200">{eq.name}</h3>
                      <div className="mt-1 space-y-1 text-sm text-gray-400">
                        <p>Серийный номер: <span className="font-mono text-gray-300">{eq.serialNumber}</span></p>
                        <p>Инвентарный номер: <span className="font-mono text-gray-300">{eq.inventoryNumber}</span></p>
                        {eq.brand && <p>Бренд: {eq.brand} {eq.model}</p>}
                      </div>
                    </div>
                    <Plus className="w-5 h-5 text-green-400 flex-shrink-0" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

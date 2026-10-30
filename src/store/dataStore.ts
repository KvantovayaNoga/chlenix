import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Employee, Equipment, Assignment, EquipmentCategory, DashboardStats, VirtualMachine, NetworkInterface, Service, AuditLogEntry, Department, Position, Branch, HistoryEntry, Organization } from '../types';
import { useAuthStore } from './authStore';

const now = new Date().toISOString();

// Helper: добавление записи в аудит
function addAuditLog(
  state: DataState,
  action: AuditLogEntry['action'],
  entityType: string,
  entityId: string,
  entityName: string,
  details: string
): AuditLogEntry[] {
  const currentUser = useAuthStore.getState().currentUser;
  const entry: AuditLogEntry = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    userId: currentUser?.id || null,
    userName: currentUser?.fullName || 'Система',
    action,
    entityType,
    entityId,
    entityName,
    details,
    timestamp: new Date().toISOString(),
  };
  return [...state.auditLog, entry];
}

// Helper: создание записи истории
function createHistoryEntry(
  action: HistoryEntry['action'],
  fieldName?: string,
  oldValue?: string,
  newValue?: string
): HistoryEntry {
  const currentUser = useAuthStore.getState().currentUser;
  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    action,
    fieldName,
    oldValue,
    newValue,
    changedBy: currentUser?.fullName || 'Система',
    changedAt: new Date().toISOString(),
  };
}

// ============================================================
// Продакшн-режим: сервис стартует пустым.
// Все данные (справочники, сотрудники, оборудование, ВМ, сервисы)
// заполняет администратор организации через интерфейс.
// ============================================================

interface DataState {
  organizations: Organization[];
  departments: Department[];
  positions: Position[];
  branches: Branch[];
  employees: Employee[];
  equipment: Equipment[];
  assignments: Assignment[];
  virtualMachines: VirtualMachine[];
  services: Service[];
  auditLog: AuditLogEntry[];

  // Organizations
  addOrganization: (data: Omit<Organization, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'createdBy'>) => Organization;
  updateOrganization: (id: string, data: Partial<Organization>) => void;
  deleteOrganization: (id: string) => void;
  getOrganizationById: (id: string) => Organization | undefined;
  getCurrentUserOrganization: () => Organization | undefined;

  // Departments
  addDepartment: (data: Omit<Department, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  updateDepartment: (id: string, data: Partial<Department>) => void;
  deleteDepartment: (id: string) => void;

  // Positions
  addPosition: (data: Omit<Position, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  updatePosition: (id: string, data: Partial<Position>) => void;
  deletePosition: (id: string) => void;

  // Branches
  addBranch: (data: Omit<Branch, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  updateBranch: (id: string, data: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;

  // Employees
  addEmployee: (data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  getEmployeeById: (id: string) => Employee | undefined;

  // Equipment
  addEquipment: (data: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  updateEquipment: (id: string, data: Partial<Equipment>) => void;
  deleteEquipment: (id: string) => void;
  getEquipmentById: (id: string) => Equipment | undefined;
  getEquipmentByEmployee: (employeeId: string) => Equipment[];
  getUnassignedEquipment: () => Equipment[];
  assignEquipment: (equipmentId: string, employeeId: string) => void;
  unassignEquipment: (equipmentId: string) => void;

  // VMs
  addVM: (data: Omit<VirtualMachine, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  updateVM: (id: string, data: Partial<VirtualMachine>) => void;
  deleteVM: (id: string) => void;
  getVMById: (id: string) => VirtualMachine | undefined;
  getVMsByHost: (hostId: string) => VirtualMachine[];
  getVMsByResponsible: (employeeId: string) => VirtualMachine[];
  addNetworkInterface: (vmId: string, iface: Omit<NetworkInterface, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  removeNetworkInterface: (vmId: string, ifaceId: string) => void;

  // Services
  addService: (data: Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => void;
  updateService: (id: string, data: Partial<Service>) => void;
  deleteService: (id: string) => void;
  getServicesByVM: (vmId: string) => Service[];

  // Stats
  getDashboardStats: () => DashboardStats;
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      organizations: [],
      departments: [],
      positions: [],
      branches: [],
      employees: [],
      equipment: [],
      assignments: [],
      virtualMachines: [],
      services: [],
      auditLog: [],

      // Organizations
      addOrganization: (data) => {
        const currentUser = useAuthStore.getState().currentUser;
        const historyEntry = createHistoryEntry('created');
        const newOrganization: Organization = {
          ...data,
          id: 'org' + Date.now().toString(),
          createdBy: currentUser?.id || 'system',
          createdAt: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.id || null,
          history: [historyEntry],
        };
        set((state) => ({ organizations: [...state.organizations, newOrganization] }));
        // Привязываем создавшего пользователя к организации
        if (currentUser) {
          useAuthStore.getState().setOrganizationForUser(currentUser.id, newOrganization.id);
        }
        set((state) => ({
          auditLog: addAuditLog(state, 'create', 'organization', newOrganization.id, newOrganization.name, `Создана организация "${newOrganization.name}"`),
        }));
        return newOrganization;
      },
      updateOrganization: (id, data) => {
        set((state) => {
          const oldOrg = state.organizations.find((o) => o.id === id);
          const historyEntry = createHistoryEntry('updated');
          const changes: string[] = [];
          if (oldOrg) {
            if (data.name && data.name !== oldOrg.name) changes.push(`наименование: "${oldOrg.name}" → "${data.name}"`);
            if (data.inn && data.inn !== oldOrg.inn) changes.push(`ИНН: "${oldOrg.inn}" → "${data.inn}"`);
            if (data.legalAddress && data.legalAddress !== oldOrg.legalAddress) changes.push('юридический адрес');
            if (data.directorName && data.directorName !== oldOrg.directorName) changes.push(`руководитель: "${oldOrg.directorName}" → "${data.directorName}"`);
          }
          return {
            organizations: state.organizations.map((o) =>
              o.id === id
                ? {
                    ...o,
                    ...data,
                    updatedAt: new Date().toISOString(),
                    updatedBy: useAuthStore.getState().currentUser?.id || null,
                    history: [...(o.history || []), { ...historyEntry, fieldName: changes.length > 0 ? changes.join(', ') : 'данные обновлены' }],
                  }
                : o
            ),
            auditLog: addAuditLog(state, 'update', 'organization', id, oldOrg?.name || '', `Обновлена организация "${oldOrg?.name || ''}"`),
          };
        });
      },
      deleteOrganization: (id) => {
        set((state) => {
          const org = state.organizations.find((o) => o.id === id);
          // Отвязываем пользователей от организации
          useAuthStore.getState().users
            .filter((u) => u.organizationId === id)
            .forEach((u) => useAuthStore.getState().setOrganizationForUser(u.id, null));
          return {
            organizations: state.organizations.filter((o) => o.id !== id),
            auditLog: addAuditLog(state, 'delete', 'organization', id, org?.name || '', `Удалена организация "${org?.name || ''}"`),
          };
        });
      },
      getOrganizationById: (id) => get().organizations.find((o) => o.id === id),
      getCurrentUserOrganization: () => {
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser?.organizationId) return undefined;
        return get().organizations.find((o) => o.id === currentUser.organizationId);
      },

      // Departments
      addDepartment: (data) => {
        const newItem: Department = { ...data, id: 'd' + Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null };
        set((state) => ({ departments: [...state.departments, newItem] }));
      },
      updateDepartment: (id, data) => {
        set((state) => ({ departments: state.departments.map((d) => d.id === id ? { ...d, ...data, updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null } : d) }));
      },
      deleteDepartment: (id) => {
        set((state) => ({ departments: state.departments.filter((d) => d.id !== id) }));
      },

      // Positions
      addPosition: (data) => {
        const newItem: Position = { ...data, id: 'p' + Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null };
        set((state) => ({ positions: [...state.positions, newItem] }));
      },
      updatePosition: (id, data) => {
        set((state) => ({ positions: state.positions.map((p) => p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null } : p) }));
      },
      deletePosition: (id) => {
        set((state) => ({ positions: state.positions.filter((p) => p.id !== id) }));
      },

      // Branches
      addBranch: (data) => {
        const newItem: Branch = { ...data, id: 'b' + Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null };
        set((state) => ({ branches: [...state.branches, newItem] }));
      },
      updateBranch: (id, data) => {
        set((state) => ({ branches: state.branches.map((b) => b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null } : b) }));
      },
      deleteBranch: (id) => {
        set((state) => ({ branches: state.branches.filter((b) => b.id !== id) }));
      },

      // Employees
      addEmployee: (data) => {
        const newEmployee: Employee = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null };
        set((state) => ({ employees: [...state.employees, newEmployee] }));
      },
      updateEmployee: (id, data) => {
        set((state) => ({ employees: state.employees.map((e) => e.id === id ? { ...e, ...data, updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null } : e) }));
      },
      deleteEmployee: (id) => {
        set((state) => ({ employees: state.employees.filter((e) => e.id !== id), equipment: state.equipment.map((eq) => eq.assignedToEmployeeId === id ? { ...eq, assignedToEmployeeId: null } : eq) }));
      },
      getEmployeeById: (id) => get().employees.find((e) => e.id === id),

      // Equipment
      addEquipment: (data) => {
        const historyEntry = createHistoryEntry('created');
        const newEquipment: Equipment = { 
          ...data, 
          id: Date.now().toString(), 
          createdAt: new Date().toISOString().split('T')[0], 
          updatedAt: new Date().toISOString(), 
          updatedBy: useAuthStore.getState().currentUser?.id || null,
          history: [historyEntry]
        };
        set((state) => ({ equipment: [...state.equipment, newEquipment] }));
      },
      updateEquipment: (id, data) => {
        set((state) => {
          const oldEquipment = state.equipment.find(eq => eq.id === id);
          const historyEntry = createHistoryEntry('updated');
          return {
            equipment: state.equipment.map((eq) => {
              if (eq.id === id) {
                // Сравниваем изменения и записываем в историю
                const changes: string[] = [];
                if (data.name && data.name !== eq.name) changes.push(`наименование: "${eq.name}" → "${data.name}"`);
                if (data.serialNumber && data.serialNumber !== eq.serialNumber) changes.push(`серийный номер: "${eq.serialNumber}" → "${data.serialNumber}"`);
                if (data.condition && data.condition !== eq.condition) changes.push(`состояние: "${eq.condition}" → "${data.condition}"`);
                if (data.notes !== undefined && data.notes !== eq.notes) changes.push(`примечания`);
                
                const updatedHistory = [
                  ...(eq.history || []),
                  { ...historyEntry, fieldName: changes.length > 0 ? changes.join(', ') : 'данные обновлены' }
                ];
                
                return { ...eq, ...data, updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null, history: updatedHistory };
              }
              return eq;
            })
          };
        });
      },
      deleteEquipment: (id) => {
        set((state) => ({ equipment: state.equipment.filter((eq) => eq.id !== id), assignments: state.assignments.filter((a) => a.equipmentId !== id) }));
      },
      getEquipmentById: (id) => get().equipment.find((eq) => eq.id === id),
      getEquipmentByEmployee: (employeeId) => get().equipment.filter((eq) => eq.assignedToEmployeeId === employeeId),
      getUnassignedEquipment: () => get().equipment.filter((eq) => eq.assignedToEmployeeId === null),
      assignEquipment: (equipmentId, employeeId) => {
        const assignment: Assignment = { id: Date.now().toString(), equipmentId, employeeId, assignedBy: useAuthStore.getState().currentUser?.id || 'system', assignedDate: new Date().toISOString().split('T')[0], returnedDate: null, notes: '' };
        const currentUser = useAuthStore.getState().currentUser;
        const newEmployee = get().employees.find(e => e.id === employeeId);
        
        set((state) => {
          const oldEquipment = state.equipment.find(eq => eq.id === equipmentId);
          // Ищем сотрудника даже если он уволен (isEmployed: false)
          const oldEmployee = oldEquipment?.assignedToEmployeeId 
            ? state.employees.find(e => e.id === oldEquipment.assignedToEmployeeId) 
            : null;
          
          // Формируем oldValue - ФИО сотрудника или "не закреплено"
          const oldValue = oldEmployee 
            ? `${oldEmployee.lastName} ${oldEmployee.firstName}${oldEmployee.middleName ? ' ' + oldEmployee.middleName : ''}`
            : 'не закреплено';
          
          // Формируем newValue - ФИО нового сотрудника
          const newValue = newEmployee 
            ? `${newEmployee.lastName} ${newEmployee.firstName}${newEmployee.middleName ? ' ' + newEmployee.middleName : ''}`
            : employeeId;
          
          // Создаём запись истории с oldValue и newValue
          const historyEntry = createHistoryEntry(
            'assigned',
            'закреплено за',
            oldValue,
            newValue
          );
          
          return {
            equipment: state.equipment.map((eq) => {
              if (eq.id === equipmentId) {
                const updatedHistory = [...(eq.history || []), historyEntry];
                return { ...eq, assignedToEmployeeId: employeeId, updatedAt: new Date().toISOString(), updatedBy: currentUser?.id || null, history: updatedHistory };
              }
              return eq;
            }),
            assignments: [...state.assignments, assignment]
          };
        });
      },
      unassignEquipment: (equipmentId) => {
        const currentUser = useAuthStore.getState().currentUser;
        const historyEntry = createHistoryEntry('unassigned', 'откреплено');
        
        set((state) => {
          const oldEquipment = state.equipment.find(eq => eq.id === equipmentId);
          // Ищем сотрудника даже если он уволен (isEmployed: false)
          const oldEmployee = oldEquipment?.assignedToEmployeeId 
            ? state.employees.find(e => e.id === oldEquipment.assignedToEmployeeId) 
            : null;
          
          // Формируем oldValue - ФИО сотрудника
          const oldValue = oldEmployee 
            ? `${oldEmployee.lastName} ${oldEmployee.firstName}${oldEmployee.middleName ? ' ' + oldEmployee.middleName : ''}`
            : undefined;
          
          const entryWithOldValue = { ...historyEntry, oldValue };
          
          return {
            equipment: state.equipment.map((eq) => {
              if (eq.id === equipmentId) {
                const updatedHistory = [...(eq.history || []), entryWithOldValue];
                return { ...eq, assignedToEmployeeId: null, updatedAt: new Date().toISOString(), updatedBy: currentUser?.id || null, history: updatedHistory };
              }
              return eq;
            }),
            assignments: state.assignments.map((a) => a.equipmentId === equipmentId && !a.returnedDate ? { ...a, returnedDate: new Date().toISOString().split('T')[0] } : a)
          };
        });
      },

      // VMs
      addVM: (data) => {
        const historyEntry = createHistoryEntry('created');
        const newVM: VirtualMachine = { 
          ...data, 
          id: 'vm' + Date.now().toString(), 
          createdAt: new Date().toISOString().split('T')[0], 
          updatedAt: new Date().toISOString(), 
          updatedBy: useAuthStore.getState().currentUser?.id || null,
          history: [historyEntry]
        };
        set((state) => ({ virtualMachines: [...state.virtualMachines, newVM] }));
      },
      updateVM: (id, data) => {
        set((state) => {
          const historyEntry = createHistoryEntry('updated');
          return {
            virtualMachines: state.virtualMachines.map((vm) => {
              if (vm.id === id) {
                const changes: string[] = [];
                if (data.name && data.name !== vm.name) changes.push(`имя: "${vm.name}" → "${data.name}"`);
                if (data.status && data.status !== vm.status) changes.push(`статус: "${vm.status}" → "${data.status}"`);
                if (data.cpuCores !== undefined && data.cpuCores !== vm.cpuCores) changes.push(`CPU: ${vm.cpuCores} → ${data.cpuCores}`);
                if (data.ramGB !== undefined && data.ramGB !== vm.ramGB) changes.push(`RAM: ${vm.ramGB}GB → ${data.ramGB}GB`);
                
                const updatedHistory = [
                  ...(vm.history || []),
                  { ...historyEntry, fieldName: changes.length > 0 ? changes.join(', ') : 'данные обновлены' }
                ];
                
                return { ...vm, ...data, updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null, history: updatedHistory };
              }
              return vm;
            })
          };
        });
      },
      deleteVM: (id) => {
        set((state) => ({ virtualMachines: state.virtualMachines.filter((vm) => vm.id !== id), services: state.services.filter((s) => s.virtualMachineId !== id) }));
      },
      getVMById: (id) => get().virtualMachines.find((vm) => vm.id === id),
      getVMsByHost: (hostId) => get().virtualMachines.filter((vm) => vm.hostServerId === hostId),
      getVMsByResponsible: (employeeId) => get().virtualMachines.filter((vm) => vm.responsibleEmployeeId === employeeId || vm.serviceResponsibleEmployeeId === employeeId),
      addNetworkInterface: (vmId, iface) => {
        const newIface: NetworkInterface = { ...iface, id: 'ni' + Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null };
        set((state) => ({ virtualMachines: state.virtualMachines.map((vm) => vm.id === vmId ? { ...vm, networkInterfaces: [...vm.networkInterfaces, newIface], updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null } : vm) }));
      },
      removeNetworkInterface: (vmId, ifaceId) => {
        set((state) => ({ virtualMachines: state.virtualMachines.map((vm) => vm.id === vmId ? { ...vm, networkInterfaces: vm.networkInterfaces.filter(i => i.id !== ifaceId), updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null } : vm) }));
      },

      // Services
      addService: (data) => {
        const newService: Service = { ...data, id: 'svc' + Date.now().toString(), createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null };
        set((state) => ({ services: [...state.services, newService] }));
      },
      updateService: (id, data) => {
        set((state) => ({ services: state.services.map((s) => s.id === id ? { ...s, ...data, updatedAt: new Date().toISOString(), updatedBy: useAuthStore.getState().currentUser?.id || null } : s) }));
      },
      deleteService: (id) => {
        set((state) => ({ services: state.services.filter((s) => s.id !== id) }));
      },
      getServicesByVM: (vmId) => get().services.filter((s) => s.virtualMachineId === vmId),

      // Stats
      getDashboardStats: () => {
        const { employees, equipment, virtualMachines, departments } = get();
        const activeEmployees = employees.filter((e) => e.isEmployed).length;
        const assignedEquipment = equipment.filter((eq) => eq.assignedToEmployeeId).length;
        const unassignedEquipment = equipment.filter((eq) => !eq.assignedToEmployeeId).length;
        const needsRepair = equipment.filter((eq) => eq.condition === 'needs_repair').length;
        const writtenOff = equipment.filter((eq) => eq.condition === 'written_off').length;
        const totalServers = equipment.filter((eq) => eq.category === 'server').length;
        const totalVMs = virtualMachines.length;
        const runningVMs = virtualMachines.filter((vm) => vm.status === 'running').length;

        const byCategory = equipment.reduce((acc, eq) => {
          acc[eq.category] = (acc[eq.category] || 0) + 1;
          return acc;
        }, {} as Record<EquipmentCategory, number>);

        const byDepartment = employees.reduce((acc, emp) => {
          const dept = departments.find(d => d.id === emp.departmentId);
          const deptName = dept?.name || 'Не указан';
          acc[deptName] = (acc[deptName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return { totalEmployees: employees.length, activeEmployees, totalEquipment: equipment.length, assignedEquipment, unassignedEquipment, needsRepair, writtenOff, totalServers, totalVMs, runningVMs, byCategory, byDepartment };
      },
    }),
    { name: 'data-storage-v2' }
  )
);

// ============================================================
// Хранилище данных приложения.
// Все данные хранятся в серверной БД (PostgreSQL) через REST API.
// В памяти клиента находится только кэш для отображения.
// ============================================================
import { create } from 'zustand';
import { api } from '../api/client';
import type {
  Employee, Equipment, Assignment, VirtualMachine, NetworkInterface, Service,
  AuditLogEntry, Department, Position, Branch, Organization, DashboardStats,
} from '../types';

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
  loaded: boolean;
  loading: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  clearError: () => void;

  // Organizations
  addOrganization: (data: Partial<Organization>) => Promise<Organization | null>;
  updateOrganization: (id: string, data: Partial<Organization>) => Promise<boolean>;
  deleteOrganization: (id: string) => Promise<boolean>;
  getOrganizationById: (id: string) => Organization | undefined;
  getCurrentUserOrganization: () => Organization | undefined;

  // Departments
  addDepartment: (data: Partial<Department>) => Promise<boolean>;
  updateDepartment: (id: string, data: Partial<Department>) => Promise<boolean>;
  deleteDepartment: (id: string) => Promise<boolean>;

  // Positions
  addPosition: (data: Partial<Position>) => Promise<boolean>;
  updatePosition: (id: string, data: Partial<Position>) => Promise<boolean>;
  deletePosition: (id: string) => Promise<boolean>;

  // Branches
  addBranch: (data: Partial<Branch>) => Promise<boolean>;
  updateBranch: (id: string, data: Partial<Branch>) => Promise<boolean>;
  deleteBranch: (id: string) => Promise<boolean>;

  // Employees
  addEmployee: (data: Partial<Employee>) => Promise<boolean>;
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<boolean>;
  deleteEmployee: (id: string) => Promise<boolean>;
  getEmployeeById: (id: string) => Employee | undefined;

  // Equipment
  addEquipment: (data: Partial<Equipment>) => Promise<boolean>;
  updateEquipment: (id: string, data: Partial<Equipment>) => Promise<boolean>;
  deleteEquipment: (id: string) => Promise<boolean>;
  getEquipmentById: (id: string) => Equipment | undefined;
  getEquipmentByEmployee: (employeeId: string) => Equipment[];
  getUnassignedEquipment: () => Equipment[];
  assignEquipment: (equipmentId: string, employeeId: string) => Promise<boolean>;
  unassignEquipment: (equipmentId: string) => Promise<boolean>;

  // VMs
  addVM: (data: Partial<VirtualMachine>) => Promise<boolean>;
  updateVM: (id: string, data: Partial<VirtualMachine>) => Promise<boolean>;
  deleteVM: (id: string) => Promise<boolean>;
  getVMById: (id: string) => VirtualMachine | undefined;
  getVMsByHost: (hostId: string) => VirtualMachine[];
  getVMsByResponsible: (employeeId: string) => VirtualMachine[];
  addNetworkInterface: (vmId: string, iface: Partial<NetworkInterface>) => Promise<boolean>;
  removeNetworkInterface: (vmId: string, ifaceId: string) => Promise<boolean>;

  // Services
  addService: (data: Partial<Service>) => Promise<boolean>;
  updateService: (id: string, data: Partial<Service>) => Promise<boolean>;
  deleteService: (id: string) => Promise<boolean>;
  getServicesByVM: (vmId: string) => Service[];

  // Stats
  getDashboardStats: () => DashboardStats;
}

let loadPromise: Promise<void> | null = null;

async function run(set: any, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    set({ error: null });
    return true;
  } catch (e: any) {
    set({ error: e?.message || 'Ошибка сервера' });
    return false;
  }
}

export const useDataStore = create<DataState>((set, get) => ({
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
  loaded: false,
  loading: false,
  error: null,

  loadAll: async () => {
    if (loadPromise) return loadPromise;
    set({ loading: true });
    loadPromise = (async () => {
      try {
        const [organizations, departments, positions, branches, employees, equipment, virtualMachines, auditLog] = await Promise.all([
          api.get<Organization[]>('/organizations'),
          api.get<Department[]>('/departments'),
          api.get<Position[]>('/positions'),
          api.get<Branch[]>('/branches'),
          api.get<Employee[]>('/employees'),
          api.get<Equipment[]>('/equipment'),
          api.get<VirtualMachine[]>('/virtual-machines'),
          api.get<AuditLogEntry[]>('/audit-logs').catch(() => [] as AuditLogEntry[]),
        ]);
        const services: Service[] = virtualMachines.flatMap((vm) => vm.services || []);
        set({
          organizations, departments, positions, branches, employees, equipment, virtualMachines,
          services, auditLog, loaded: true, loading: false, error: null,
        });
      } catch (e: any) {
        set({ loading: false, error: e?.message || 'Не удалось загрузить данные с сервера' });
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  },

  clearError: () => set({ error: null }),

  // ---------- Organizations ----------
  addOrganization: async (data) => {
    let created: Organization | null = null;
    const ok = await run(set, async () => {
      created = await api.post<Organization>('/organizations', data);
      set((s: DataState) => ({ organizations: [...s.organizations, created!] }));
    });
    return ok ? created : null;
  },

  updateOrganization: async (id, data) => {
    const ok = await run(set, async () => {
      const updated = await api.put<Organization>(`/organizations/${id}`, data);
      set((s: DataState) => ({ organizations: s.organizations.map((o) => (o.id === id ? updated : o)) }));
    });
    return ok;
  },

  deleteOrganization: async (id) => {
    const ok = await run(set, async () => {
      await api.delete(`/organizations/${id}`);
      set((s: DataState) => ({ organizations: s.organizations.filter((o) => o.id !== id) }));
    });
    return ok;
  },

  getOrganizationById: (id) => get().organizations.find((o) => o.id === id),

  getCurrentUserOrganization: () => {
    // Организация текущего пользователя определяется по токену сессии на сервере;
    // на клиенте берём единственную организацию (в системе она одна).
    const orgs = get().organizations;
    return orgs.length > 0 ? orgs[0] : undefined;
  },

  // ---------- Directories ----------
  addDepartment: async (data) => run(set, async () => {
    const item = await api.post<Department>('/departments', data);
    set((s: DataState) => ({ departments: [...s.departments, item].sort((a, b) => a.name.localeCompare(b.name)) }));
  }),
  updateDepartment: async (id, data) => run(set, async () => {
    const item = await api.put<Department>(`/departments/${id}`, data);
    set((s: DataState) => ({ departments: s.departments.map((d) => (d.id === id ? item : d)) }));
  }),
  deleteDepartment: async (id) => run(set, async () => {
    await api.delete(`/departments/${id}`);
    set((s: DataState) => ({ departments: s.departments.filter((d) => d.id !== id) }));
  }),

  addPosition: async (data) => run(set, async () => {
    const item = await api.post<Position>('/positions', data);
    set((s: DataState) => ({ positions: [...s.positions, item].sort((a, b) => a.name.localeCompare(b.name)) }));
  }),
  updatePosition: async (id, data) => run(set, async () => {
    const item = await api.put<Position>(`/positions/${id}`, data);
    set((s: DataState) => ({ positions: s.positions.map((p) => (p.id === id ? item : p)) }));
  }),
  deletePosition: async (id) => run(set, async () => {
    await api.delete(`/positions/${id}`);
    set((s: DataState) => ({ positions: s.positions.filter((p) => p.id !== id) }));
  }),

  addBranch: async (data) => run(set, async () => {
    const item = await api.post<Branch>('/branches', data);
    set((s: DataState) => ({ branches: [...s.branches, item].sort((a, b) => a.name.localeCompare(b.name)) }));
  }),
  updateBranch: async (id, data) => run(set, async () => {
    const item = await api.put<Branch>(`/branches/${id}`, data);
    set((s: DataState) => ({ branches: s.branches.map((b) => (b.id === id ? item : b)) }));
  }),
  deleteBranch: async (id) => run(set, async () => {
    await api.delete(`/branches/${id}`);
    set((s: DataState) => ({ branches: s.branches.filter((b) => b.id !== id) }));
  }),

  // ---------- Employees ----------
  addEmployee: async (data) => run(set, async () => {
    await api.post('/employees', data);
    await reloadEmployees(set, get);
  }),
  updateEmployee: async (id, data) => run(set, async () => {
    await api.put(`/employees/${id}`, data);
    await reloadEmployees(set, get);
  }),
  deleteEmployee: async (id) => run(set, async () => {
    await api.delete(`/employees/${id}`);
    set((s: DataState) => ({ employees: s.employees.filter((e) => e.id !== id) }));
  }),
  getEmployeeById: (id) => get().employees.find((e) => e.id === id),

  // ---------- Equipment ----------
  addEquipment: async (data) => run(set, async () => {
    await api.post('/equipment', data);
    await reloadEquipment(set, get);
  }),
  updateEquipment: async (id, data) => run(set, async () => {
    await api.put(`/equipment/${id}`, data);
    await reloadEquipment(set, get);
  }),
  deleteEquipment: async (id) => run(set, async () => {
    await api.delete(`/equipment/${id}`);
    set((s: DataState) => ({ equipment: s.equipment.filter((e) => e.id !== id) }));
  }),
  getEquipmentById: (id) => get().equipment.find((e) => e.id === id),
  getEquipmentByEmployee: (employeeId) => get().equipment.filter((e) => e.assignedToEmployeeId === employeeId),
  getUnassignedEquipment: () => get().equipment.filter((e) => !e.assignedToEmployeeId),

  assignEquipment: async (equipmentId, employeeId) => run(set, async () => {
    await api.post(`/equipment/${equipmentId}/assign`, { employeeId });
    await Promise.all([reloadEquipment(set, get), reloadEmployees(set, get)]);
  }),
  unassignEquipment: async (equipmentId) => run(set, async () => {
    await api.post(`/equipment/${equipmentId}/unassign`, {});
    await Promise.all([reloadEquipment(set, get), reloadEmployees(set, get)]);
  }),

  // ---------- Virtual Machines ----------
  addVM: async (data) => run(set, async () => {
    await api.post('/virtual-machines', data);
    await reloadVMs(set, get);
  }),
  updateVM: async (id, data) => run(set, async () => {
    await api.put(`/virtual-machines/${id}`, data);
    await reloadVMs(set, get);
  }),
  deleteVM: async (id) => run(set, async () => {
    await api.delete(`/virtual-machines/${id}`);
    set((s: DataState) => ({
      virtualMachines: s.virtualMachines.filter((v) => v.id !== id),
      services: s.services.filter((sv) => sv.virtualMachineId !== id),
    }));
  }),
  getVMById: (id) => get().virtualMachines.find((v) => v.id === id),
  getVMsByHost: (hostId) => get().virtualMachines.filter((v) => v.hostServerId === hostId),
  getVMsByResponsible: (employeeId) => get().virtualMachines.filter(
    (v) => v.responsibleEmployeeId === employeeId || v.serviceResponsibleEmployeeId === employeeId,
  ),

  addNetworkInterface: async (vmId, iface) => run(set, async () => {
    await api.post(`/virtual-machines/${vmId}/network-interfaces`, iface);
    await reloadVMs(set, get);
  }),
  removeNetworkInterface: async (_vmId, ifaceId) => run(set, async () => {
    await api.delete(`/network-interfaces/${ifaceId}`);
    await reloadVMs(set, get);
  }),

  // ---------- Services ----------
  addService: async (data) => run(set, async () => {
    const vmId = (data as any).virtualMachineId;
    await api.post(`/virtual-machines/${vmId}/services`, data);
    await reloadVMs(set, get);
  }),
  updateService: async (id, data) => run(set, async () => {
    await api.put(`/services/${id}`, data);
    await reloadVMs(set, get);
  }),
  deleteService: async (id) => run(set, async () => {
    await api.delete(`/services/${id}`);
    await reloadVMs(set, get);
  }),
  getServicesByVM: (vmId) => get().services.filter((s) => s.virtualMachineId === vmId),

  // ---------- Stats ----------
  getDashboardStats: () => {
    const { employees, equipment, virtualMachines, departments } = get();
    const activeEmployees = employees.filter((e) => e.isEmployed).length;
    const assignedEquipment = equipment.filter((eq) => eq.assignedToEmployeeId).length;
    return {
      totalEmployees: employees.length,
      activeEmployees,
      totalEquipment: equipment.length,
      assignedEquipment,
      unassignedEquipment: equipment.length - assignedEquipment,
      totalVirtualMachines: virtualMachines.length,
      activeVirtualMachines: virtualMachines.filter((v) => v.status === 'running').length,
      totalDepartments: departments.length,
    };
  },
} as any));

async function reloadEmployees(set: any, get: () => DataState) {
  const employees = await api.get<Employee[]>('/employees');
  set({ employees });
  await reloadEquipment(set, get);
}

async function reloadEquipment(set: any, _get: () => DataState) {
  const equipment = await api.get<Equipment[]>('/equipment');
  set({ equipment });
}

async function reloadVMs(set: any, _get: () => DataState) {
  const virtualMachines = await api.get<VirtualMachine[]>('/virtual-machines');
  const services: Service[] = virtualMachines.flatMap((vm) => vm.services || []);
  set({ virtualMachines, services });
}

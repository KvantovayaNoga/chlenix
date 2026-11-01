// ============================================================
// Хранилище данных приложения.
// Все данные хранятся в серверной БД (PostgreSQL) через REST API.
// В памяти клиента находится только кэш для отображения.
// Реализовано на React Context — Zustand из проекта удалён.
// ============================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setToken } from '../api/client';
import { useAuthStore } from './authStore';
import type {
  Employee, Equipment, VirtualMachine, Service, User,
  AuditLogEntry, Department, Position, Branch, Organization, DashboardStats,
} from '../types';

interface DataState {
  organizations: Organization[];
  departments: Department[];
  positions: Position[];
  branches: Branch[];
  employees: Employee[];
  equipment: Equipment[];
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
  addNetworkInterface: (vmId: string, iface: Partial<Service> & Record<string, unknown>) => Promise<boolean>;
  removeNetworkInterface: (vmId: string, ifaceId: string) => Promise<boolean>;

  // Services
  addService: (data: Partial<Service> & Record<string, unknown>) => Promise<boolean>;
  updateService: (id: string, data: Partial<Service>) => Promise<boolean>;
  deleteService: (id: string) => Promise<boolean>;
  getServicesByVM: (vmId: string) => Service[];

  // Stats
  getDashboardStats: () => DashboardStats;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [virtualMachines, setVirtualMachines] = useState<VirtualMachine[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated, currentUser, setCurrentUser } = useAuthStore();

  // Ссылка на актуального пользователя для loadAll (стабильный колбэк + снимок orgId)
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Актуальные списки для «геттеров» без пересоздания контекста
  const ref = useRef({ organizations, departments, positions, branches, employees, equipment, virtualMachines, services });
  ref.current = { organizations, departments, positions, branches, employees, equipment, virtualMachines, services };

  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const reloadEmployees = useCallback(async () => {
    const list = await api.get<Employee[]>('/employees');
    setEmployees(list);
    await reloadEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadEquipment = useCallback(async () => {
    const list = await api.get<Equipment[]>('/equipment');
    setEquipment(list);
  }, []);

  const reloadVMs = useCallback(async () => {
    const vms = await api.get<VirtualMachine[]>('/virtual-machines');
    setVirtualMachines(vms);
    setServices(vms.flatMap((vm) => vm.services || []));
  }, []);

  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    try {
      await fn();
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error)?.message || 'Ошибка сервера');
      return false;
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (loadPromiseRef.current) return loadPromiseRef.current;
    // Снимок активной организации на момент старта загрузки. Если в процессе
    // await пользователь переключится/создаст организацию (поменяется JWT),
    // ответ запросов относится к СТАРОЙ организации — применять его нельзя,
    // иначе свежие списки перезапираются устаревшими (баг «штатное расписание
    // пустое» / «данные другой организации»).
    const orgAtStart = currentUser?.organizationId ?? null;
    setLoading(true);
    loadPromiseRef.current = (async () => {
      try {
        const [orgs, deps, poss, brs, emps, eq, vms, logs] = await Promise.all([
          api.get<Organization[]>('/organizations'),
          api.get<Department[]>('/departments'),
          api.get<Position[]>('/positions'),
          api.get<Branch[]>('/branches'),
          api.get<Employee[]>('/employees'),
          api.get<Equipment[]>('/equipment'),
          api.get<VirtualMachine[]>('/virtual-machines'),
          api.get<AuditLogEntry[]>('/audit-logs').catch(() => [] as AuditLogEntry[]),
        ]);
        if (orgAtStart !== (currentUserRef.current?.organizationId ?? null)) {
          // Организация сменилась во время загрузки — отбрасываем устаревший ответ,
          // useEffect по organizationId перезагрузит данные уже с новым токеном.
          return;
        }
        setOrganizations(orgs);
        setDepartments(deps);
        setPositions(poss);
        setBranches(brs);
        setEmployees(emps);
        setEquipment(eq);
        setVirtualMachines(vms);
        setServices(vms.flatMap((vm) => vm.services || []));
        setAuditLog(logs);
        setLoaded(true);
        setError(null);
      } catch (e) {
        setError((e as Error)?.message || 'Не удалось загрузить данные с сервера');
      } finally {
        setLoading(false);
        loadPromiseRef.current = null;
      }
    })();
    return loadPromiseRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.organizationId]);

  // Загрузка данных после авторизации
  useEffect(() => {
    if (isAuthenticated && !loaded && !loading) {
      void loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // При переключении активной организации перезагружаем скоупленные данные
  const prevOrgRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const orgId = currentUser?.organizationId ?? null;
    if (prevOrgRef.current === undefined) { prevOrgRef.current = orgId; return; }
    if (prevOrgRef.current !== orgId && isAuthenticated) {
      prevOrgRef.current = orgId;
      setLoaded(false);
      loadPromiseRef.current = null; // сбросить in-flight dedupe
      void loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.organizationId, isAuthenticated]);

  const clearError = useCallback(() => setError(null), []);

  // ---------- Organizations ----------
  const addOrganization = useCallback(async (data: Partial<Organization>) => {
    let created: Organization | null = null;
    const ok = await run(async () => {
      // Бэкенд возвращает { ...organization, token, user }: создавший автоматически
      // переключается на новую организацию — нужно обновить токен сессии, иначе
      // справочники/сотрудники останутся привязаны к прежней организации.
      created = await api.post<Organization & { token?: string; user?: User }>('/organizations', data);
      const res = created as Organization & { token?: string; user?: User };
      if (res.token) setToken(res.token);
      if (res.user) setCurrentUser(res.user);
      setOrganizations((prev) => [...prev, res]);
      // Активная организация сменилась на новую (пустую): справочники/сотрудники
      // прежней организации больше не относятся к скоупу — перезагружаем данные,
      // иначе «Штатное расписание» покажет устаревший набор или пустоту.
      setDepartments([]); setPositions([]); setBranches([]);
      setLoaded(false);
      loadPromiseRef.current = null;
      void loadAll();
    });
    return ok ? created : null;
  }, [run, loadAll]);

  const updateOrganization = useCallback((id: string, data: Partial<Organization>) => run(async () => {
    const updated = await api.put<Organization>(`/organizations/${id}`, data);
    setOrganizations((prev) => prev.map((o) => (o.id === id ? updated : o)));
  }), [run]);

  const deleteOrganization = useCallback(async (id: string): Promise<boolean> => {
    let ok = false;
    await run(async () => {
      // Бэкенд при удалении активной организации возвращает перевыпущенный JWT
      // (с новой активной организацией или без неё) — применяем его сразу,
      // иначе скоупы запросов останутся привязаны к удалённой организации.
      const res = await api.delete<{ token?: string; user?: User }>(`/organizations/${id}`);
      if (res?.token) setToken(res.token);
      if (res?.user) setCurrentUser(res.user);
      setOrganizations((prev) => prev.filter((o) => o.id !== id));
      ok = true;
    });
    return ok;
  }, [run]);

  const getOrganizationById = useCallback((id: string) => ref.current.organizations.find((o) => o.id === id), []);

  const getCurrentUserOrganization = useCallback(() => {
    // Мультиорганизационность: активная организация = organizationId пользователя из сессии.
    const orgs = ref.current.organizations;
    if (!currentUser?.organizationId) return orgs.length > 0 ? orgs[0] : undefined;
    return orgs.find((o) => o.id === currentUser.organizationId) ?? (orgs.length > 0 ? orgs[0] : undefined);
  }, [currentUser]);

  // ---------- Directories ----------
  // ВАЖНО (баг «штатное расписание пустое»): бэкенд при создании организации
  // перевыпускает JWT и привязывает пользователя к новой организации. Если в этот
  // момент выполняется in-flight loadAll() (стартовый запрос данных), его ответ
  // содержит справочники ПРЕЖНЕЙ организации и перезапишет очищенные списки —
  // карусель «пусто после создания организации». Поэтому перед каждой мутацией
  // справочников дожидаемся завершения загрузки: данные будут актуальны для
  // текущего токена, а добавление записи не потеряется под ней.
  const addDepartment = useCallback((data: Partial<Department>) => run(async () => {
    await loadAll();
    const item = await api.post<Department>('/departments', data);
    setDepartments((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
  }), [run, loadAll]);
  const updateDepartment = useCallback((id: string, data: Partial<Department>) => run(async () => {
    const item = await api.put<Department>(`/departments/${id}`, data);
    setDepartments((prev) => prev.map((d) => (d.id === id ? item : d)));
  }), [run]);
  const deleteDepartment = useCallback((id: string) => run(async () => {
    await api.delete(`/departments/${id}`);
    setDepartments((prev) => prev.filter((d) => d.id !== id));
  }), [run]);

  const addPosition = useCallback((data: Partial<Position>) => run(async () => {
    await loadAll();
    const item = await api.post<Position>('/positions', data);
    setPositions((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
  }), [run, loadAll]);
  const updatePosition = useCallback((id: string, data: Partial<Position>) => run(async () => {
    const item = await api.put<Position>(`/positions/${id}`, data);
    setPositions((prev) => prev.map((p) => (p.id === id ? item : p)));
  }), [run]);
  const deletePosition = useCallback((id: string) => run(async () => {
    await api.delete(`/positions/${id}`);
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }), [run]);

  const addBranch = useCallback((data: Partial<Branch>) => run(async () => {
    await loadAll();
    const item = await api.post<Branch>('/branches', data);
    setBranches((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
  }), [run, loadAll]);
  const updateBranch = useCallback((id: string, data: Partial<Branch>) => run(async () => {
    const item = await api.put<Branch>(`/branches/${id}`, data);
    setBranches((prev) => prev.map((b) => (b.id === id ? item : b)));
  }), [run]);
  const deleteBranch = useCallback((id: string) => run(async () => {
    await api.delete(`/branches/${id}`);
    setBranches((prev) => prev.filter((b) => b.id !== id));
  }), [run]);

  // ---------- Employees ----------
  const addEmployee = useCallback((data: Partial<Employee>) => run(async () => {
    await api.post('/employees', data);
    await reloadEmployees();
  }), [run, reloadEmployees]);
  const updateEmployee = useCallback((id: string, data: Partial<Employee>) => run(async () => {
    await api.put(`/employees/${id}`, data);
    await reloadEmployees();
  }), [run, reloadEmployees]);
  const deleteEmployee = useCallback((id: string) => run(async () => {
    await api.delete(`/employees/${id}`);
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  }), [run]);
  const getEmployeeById = useCallback((id: string) => ref.current.employees.find((e) => e.id === id), []);

  // ---------- Equipment ----------
  const addEquipment = useCallback((data: Partial<Equipment>) => run(async () => {
    await api.post('/equipment', data);
    await reloadEquipment();
  }), [run, reloadEquipment]);
  const updateEquipment = useCallback((id: string, data: Partial<Equipment>) => run(async () => {
    await api.put(`/equipment/${id}`, data);
    await reloadEquipment();
  }), [run, reloadEquipment]);
  const deleteEquipment = useCallback((id: string) => run(async () => {
    await api.delete(`/equipment/${id}`);
    setEquipment((prev) => prev.filter((e) => e.id !== id));
  }), [run]);
  const getEquipmentById = useCallback((id: string) => ref.current.equipment.find((e) => e.id === id), []);
  const getEquipmentByEmployee = useCallback((employeeId: string) => ref.current.equipment.filter((e) => e.assignedToEmployeeId === employeeId), []);
  const getUnassignedEquipment = useCallback(() => ref.current.equipment.filter((e) => !e.assignedToEmployeeId), []);

  const assignEquipment = useCallback((equipmentId: string, employeeId: string) => run(async () => {
    await api.post(`/equipment/${equipmentId}/assign`, { employeeId });
    await Promise.all([reloadEquipment(), reloadEmployees()]);
  }), [run, reloadEquipment, reloadEmployees]);
  const unassignEquipment = useCallback((equipmentId: string) => run(async () => {
    await api.post(`/equipment/${equipmentId}/unassign`, {});
    await Promise.all([reloadEquipment(), reloadEmployees()]);
  }), [run, reloadEquipment, reloadEmployees]);

  // ---------- Virtual Machines ----------
  const addVM = useCallback((data: Partial<VirtualMachine>) => run(async () => {
    await api.post('/virtual-machines', data);
    await reloadVMs();
  }), [run, reloadVMs]);
  const updateVM = useCallback((id: string, data: Partial<VirtualMachine>) => run(async () => {
    await api.put(`/virtual-machines/${id}`, data);
    await reloadVMs();
  }), [run, reloadVMs]);
  const deleteVM = useCallback((id: string) => run(async () => {
    await api.delete(`/virtual-machines/${id}`);
    setVirtualMachines((prev) => prev.filter((v) => v.id !== id));
    setServices((prev) => prev.filter((sv) => sv.virtualMachineId !== id));
  }), [run]);
  const getVMById = useCallback((id: string) => ref.current.virtualMachines.find((v) => v.id === id), []);
  const getVMsByHost = useCallback((hostId: string) => ref.current.virtualMachines.filter((v) => v.hostServerId === hostId), []);
  const getVMsByResponsible = useCallback((employeeId: string) => ref.current.virtualMachines.filter(
    (v) => v.responsibleEmployeeId === employeeId || v.serviceResponsibleEmployeeId === employeeId,
  ), []);

  const addNetworkInterface = useCallback((vmId: string, iface: Partial<Service> & Record<string, unknown>) => run(async () => {
    await api.post(`/virtual-machines/${vmId}/network-interfaces`, iface);
    await reloadVMs();
  }), [run, reloadVMs]);
  const removeNetworkInterface = useCallback((_vmId: string, ifaceId: string) => run(async () => {
    await api.delete(`/network-interfaces/${ifaceId}`);
    await reloadVMs();
  }), [run, reloadVMs]);

  // ---------- Services ----------
  const addService = useCallback((data: Partial<Service> & Record<string, unknown>) => run(async () => {
    const vmId = data.virtualMachineId as string;
    await api.post(`/virtual-machines/${vmId}/services`, data);
    await reloadVMs();
  }), [run, reloadVMs]);
  const updateService = useCallback((id: string, data: Partial<Service>) => run(async () => {
    await api.put(`/services/${id}`, data);
    await reloadVMs();
  }), [run, reloadVMs]);
  const deleteService = useCallback((id: string) => run(async () => {
    await api.delete(`/services/${id}`);
    await reloadVMs();
  }), [run, reloadVMs]);
  const getServicesByVM = useCallback((vmId: string) => ref.current.services.filter((s) => s.virtualMachineId === vmId), []);

  // ---------- Stats ----------
  const getDashboardStats = useCallback((): DashboardStats => {
    const { employees: emps, equipment: eq, virtualMachines: vms, departments: deps } = ref.current;
    const activeEmployees = emps.filter((e) => e.isEmployed).length;
    const assignedEquipment = eq.filter((item) => item.assignedToEmployeeId).length;

    const byCategory = {} as Record<string, number>;
    for (const item of eq) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }

    const deptNames = new Map(deps.map((d) => [d.id, d.name]));
    const byDepartment: Record<string, number> = {};
    for (const e of emps) {
      if (!e.isEmployed) continue;
      const name = (e.departmentId && deptNames.get(e.departmentId)) || 'Без отдела';
      byDepartment[name] = (byDepartment[name] || 0) + 1;
    }

    return {
      totalOrganizations: ref.current.organizations.length,
      totalEmployees: emps.length,
      activeEmployees,
      totalEquipment: eq.length,
      assignedEquipment,
      unassignedEquipment: eq.length - assignedEquipment,
      needsRepair: eq.filter((item) => item.condition === 'needs_repair').length,
      writtenOff: eq.filter((item) => item.condition === 'written_off').length,
      totalServers: eq.filter((item) => item.category === 'server').length,
      totalVMs: vms.length,
      runningVMs: vms.filter((v) => v.status === 'running').length,
      byCategory: byCategory as DashboardStats['byCategory'],
      byDepartment,
    };
  }, []);

  const value = useMemo<DataState>(() => ({
    organizations, departments, positions, branches, employees, equipment,
    virtualMachines, services, auditLog, loaded, loading, error,
    loadAll, clearError,
    addOrganization, updateOrganization, deleteOrganization, getOrganizationById, getCurrentUserOrganization,
    addDepartment, updateDepartment, deleteDepartment,
    addPosition, updatePosition, deletePosition,
    addBranch, updateBranch, deleteBranch,
    addEmployee, updateEmployee, deleteEmployee, getEmployeeById,
    addEquipment, updateEquipment, deleteEquipment, getEquipmentById, getEquipmentByEmployee,
    getUnassignedEquipment, assignEquipment, unassignEquipment,
    addVM, updateVM, deleteVM, getVMById, getVMsByHost, getVMsByResponsible,
    addNetworkInterface, removeNetworkInterface,
    addService, updateService, deleteService, getServicesByVM,
    getDashboardStats,
  }), [
    organizations, departments, positions, branches, employees, equipment,
    virtualMachines, services, auditLog, loaded, loading, error,
    loadAll, clearError,
    addOrganization, updateOrganization, deleteOrganization, getOrganizationById, getCurrentUserOrganization,
    addDepartment, updateDepartment, deleteDepartment,
    addPosition, updatePosition, deletePosition,
    addBranch, updateBranch, deleteBranch,
    addEmployee, updateEmployee, deleteEmployee, getEmployeeById,
    addEquipment, updateEquipment, deleteEquipment, getEquipmentById, getEquipmentByEmployee,
    getUnassignedEquipment, assignEquipment, unassignEquipment,
    addVM, updateVM, deleteVM, getVMById, getVMsByHost, getVMsByResponsible,
    addNetworkInterface, removeNetworkInterface,
    addService, updateService, deleteService, getServicesByVM,
    getDashboardStats,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

const asyncNoop = async (..._a: unknown[]) => undefined;

// Пустое резервное состояние: если хук вызван вне <DataProvider>,
// рендер продолжается с пустыми данными вместо падения (страховка от
// «только фон» на продакшен-сборке). Провайдеры всегда смонтированы в main.tsx.
const EMPTY_DATA_STATE: DataState = {
  organizations: [],
  departments: [],
  positions: [],
  branches: [],
  employees: [],
  equipment: [],
  virtualMachines: [],
  services: [],
  auditLog: [],
  loaded: false,
  loading: false,
  error: null,
  loadAll: asyncNoop as unknown as DataState['loadAll'],
  clearError: () => {},
  addOrganization: asyncNoop as unknown as DataState['addOrganization'],
  updateOrganization: asyncNoop as unknown as DataState['updateOrganization'],
  deleteOrganization: asyncNoop as unknown as DataState['deleteOrganization'],
  getOrganizationById: (() => undefined) as unknown as DataState['getOrganizationById'],
  getCurrentUserOrganization: (() => undefined) as unknown as DataState['getCurrentUserOrganization'],
  addDepartment: asyncNoop as unknown as DataState['addDepartment'],
  updateDepartment: asyncNoop as unknown as DataState['updateDepartment'],
  deleteDepartment: asyncNoop as unknown as DataState['deleteDepartment'],
  addPosition: asyncNoop as unknown as DataState['addPosition'],
  updatePosition: asyncNoop as unknown as DataState['updatePosition'],
  deletePosition: asyncNoop as unknown as DataState['deletePosition'],
  addBranch: asyncNoop as unknown as DataState['addBranch'],
  updateBranch: asyncNoop as unknown as DataState['updateBranch'],
  deleteBranch: asyncNoop as unknown as DataState['deleteBranch'],
  addEmployee: asyncNoop as unknown as DataState['addEmployee'],
  updateEmployee: asyncNoop as unknown as DataState['updateEmployee'],
  deleteEmployee: asyncNoop as unknown as DataState['deleteEmployee'],
  getEmployeeById: (() => undefined) as unknown as DataState['getEmployeeById'],
  addEquipment: asyncNoop as unknown as DataState['addEquipment'],
  updateEquipment: asyncNoop as unknown as DataState['updateEquipment'],
  deleteEquipment: asyncNoop as unknown as DataState['deleteEquipment'],
  getEquipmentById: (() => undefined) as unknown as DataState['getEquipmentById'],
  getEquipmentByEmployee: (() => []) as unknown as DataState['getEquipmentByEmployee'],
  getUnassignedEquipment: (() => []) as unknown as DataState['getUnassignedEquipment'],
  assignEquipment: asyncNoop as unknown as DataState['assignEquipment'],
  unassignEquipment: asyncNoop as unknown as DataState['unassignEquipment'],
  addVM: asyncNoop as unknown as DataState['addVM'],
  updateVM: asyncNoop as unknown as DataState['updateVM'],
  deleteVM: asyncNoop as unknown as DataState['deleteVM'],
  getVMById: (() => undefined) as unknown as DataState['getVMById'],
  getVMsByHost: (() => []) as unknown as DataState['getVMsByHost'],
  getVMsByResponsible: (() => []) as unknown as DataState['getVMsByResponsible'],
  addNetworkInterface: asyncNoop as unknown as DataState['addNetworkInterface'],
  removeNetworkInterface: asyncNoop as unknown as DataState['removeNetworkInterface'],
  addService: asyncNoop as unknown as DataState['addService'],
  updateService: asyncNoop as unknown as DataState['updateService'],
  deleteService: asyncNoop as unknown as DataState['deleteService'],
  getServicesByVM: (() => []) as unknown as DataState['getServicesByVM'],
  getDashboardStats: (() => ({
    totalEmployees: 0, activeEmployees: 0, totalEquipment: 0, assignedEquipment: 0,
    totalServers: 0, onlineServers: 0, offlineServers: 0, totalVMs: 0, runningVMs: 0,
    stoppedVMs: 0, totalServices: 0, healthyServices: 0, problematicServices: 0,
    totalOrganizations: 0, totalDepartments: 0,
  })) as unknown as DataState['getDashboardStats'],
};

// Совместимое имя хука. Вызов без аргумента возвращает всё состояние;
// вызов с селектором — выбранное поле.
export function useDataStore(): DataState;
export function useDataStore<T>(selector: (state: DataState) => T): T;
export function useDataStore<T>(selector?: (state: DataState) => T): DataState | T {
  const ctx = useContext(DataContext);
  // Fallback вместо броска: отсутствие провайдера не должно обрывать рендер.
  const value = ctx ?? EMPTY_DATA_STATE;
  return selector ? selector(value) : value;
}

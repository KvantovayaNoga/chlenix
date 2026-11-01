// Роли пользователей
export type UserRole = 'admin' | 'materially_responsible' | 'viewer';

// Запись истории изменений
export interface HistoryEntry {
  id: string;
  action: 'created' | 'updated' | 'assigned' | 'unassigned' | 'deleted';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy: string;
  changedAt: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

// Пользователь системы (для авторизации). Ответ API (пароль не передаётся клиенту).
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatar?: string; // Base64 encoded image
  theme?: ThemePreference;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  organizationId?: string | null; // Активная организация пользователя
  accessibleOrganizations?: Array<{
    id: string;
    name: string;
    isOwn: boolean;
    // Краткие реквизиты для карточек на странице «Сменить организацию»
    shortName?: string;
    legalAddress?: string;
    phone?: string;
    inn?: string;
    directorName?: string;
  }>; // Где может работать пользователь
}

// Организация (создаётся пользователем после регистрации)
export type OrganizationLegalForm = 'OOO' | 'AO' | 'PAO' | 'IAO' | 'IPO' | 'PT' | 'GP' | 'ANO' | 'FGBU' | 'MBU' | 'IP';

export interface Organization {
  id: string;
  name: string;                 // Наименование организации
  legalForm: string | null;     // ОПФ — свободный текст (вводится вручную)
  shortName: string;            // Краткое наименование
  inn: string;                  // ИНН
  kpp: string;                  // КПП (может отсутствовать, например у ИП)
  ogrn: string;                 // ОГРН / ОГРНИП
  legalAddress: string;         // Юридический адрес
  actualAddress: string;        // Фактический адрес
  postalCode: string;           // Почтовый индекс
  city: string;                 // Город
  phone: string;                // Контактный телефон
  email: string;                // Email
  website: string;              // Сайт
  directorName: string;         // Руководитель (ФИО)
  /** @deprecated Главный бухгалтер больше не указывается в карточке организации —
   * он определяется по штатному расписанию (должность среди сотрудников). */
  accountantName?: string;
  bankName: string;             // Наименование банка
  checkingAccount: string;      // Расчётный счёт
  correspondentAccount: string; // Корреспондентский счёт
  bik: string;                  // БИК
  taxSystem: string;            // Система налогообложения
  industry: string;             // Отрасль / вид деятельности
  employeeCount: number | null; // Штатная численность
  foundedDate: string;          // Дата основания
  logo?: string;                // Логотип (Base64)
  notes: string;                // Примечания
  createdBy: string;            // ID пользователя-создателя
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  history?: HistoryEntry[];
}

// Справочник: отделы
export interface Department {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Справочник: должности
export interface Position {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Справочник: филиалы
export interface Branch {
  id: string;
  name: string;
  address: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Сотрудник организации
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string;
  positionId: string;
  departmentId: string;
  email: string;
  // Телефоны
  workPhone: string;
  internalPhone: string;
  personalPhone: string;
  hireDate: string;
  isEmployed: boolean;
  // Рабочее место
  branchId: string | null;      // филиал необязателен
  floor: string;
  room: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  history?: HistoryEntry[];
}

// Роль сервера/оборудования в системе виртуализации.
// Позволяет описать инфраструктуру: хосты гипервизора, СХД, консоли управления.
export type ServerRole = 'hypervisor_host' | 'storage' | 'management_console' | 'standalone';

// Признаки участия оборудования в платформе виртуализации (для сайдбара и страницы платформы)
export interface VirtualizationMeta {
  serverRole?: ServerRole | null;
  isHypervisorHost: boolean;   // физический хост гипервизора
  isStorage: boolean;          // СХД
  isManagementConsole: boolean; // консоль управления (vCenter, Proxmox VE, Yandex Cloud Console…)
  hypervisorName?: string;     // VMware ESXi / Proxmox VE / Hyper-V…
}

// Платформа виртуализации — агрегированный взгляд на инфраструктуру:
// гипервизоры (хосты), СХД, консоли управления и ВМ на них.
export interface VirtualizationPlatform {
  hypervisor: string;                 // доминирующий гипервизор по участникам
  hosts: Equipment[];                 // серверы-хосты (serverRole === 'hypervisor_host')
  storage: Equipment[];               // СХД (serverRole === 'storage')
  managementConsoles: VirtualMachine[]; // консоли управления — ВМ (например vCenter)
  physicalConsoles: Equipment[];      // консоли управления — физические серверы
  virtualMachines: VirtualMachine[];  // все ВМ, размещённые на этих хостах
}

// Категории техники/имущества
export type EquipmentCategory =
  | 'computer'
  | 'monitor'
  | 'peripheral'
  | 'furniture'
  | 'server'
  | 'storage' // СХД системы виртуализации
  | 'virtual_machine'
  | 'network'
  | 'phone'
  | 'other';

// Единица техники/имущества
export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  serialNumber: string;
  inventoryNumber: string;
  brand: string;
  model: string;
  purchaseDate: string;
  writeOffDate: string | null;
  condition: 'new' | 'good' | 'satisfactory' | 'needs_repair' | 'written_off';
  assignedToEmployeeId: string | null;
  // Расположение
  branchId: string;
  floor: string;
  room: string;
  // Характеристики (для серверов)
  cpuCores: number | null;
  ramGB: number | null;
  diskGB: number | null;
  /** Роль в системе виртуализации: хост гипервизора / СХД / консоль управления / автономный */
  serverRole?: ServerRole | null;
  /** Название гипервизора, если это хост (VMware ESXi, Proxmox VE, Hyper-V…) */
  hypervisorName?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  history?: HistoryEntry[];
}

// Результат проверки доступности сервера/ВМ
export interface HealthCheck {
  id: string;
  targetId: string; // ID сервера или ВМ
  targetType: 'server' | 'vm';
  targetName: string;
  status: 'online' | 'offline' | 'unknown';
  lastCheck: string;
  latency: number | null; // мс
  errorMessage: string | null;
  consecutiveFailures: number;
}

// Сетевой интерфейс (без подсети — только IP)
export interface NetworkInterface {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  isPublic: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Тип виртуальной машины
export type VMType = 'virtual' | 'container' | 'cloud';

// Виртуальная машина
export interface VirtualMachine {
  id: string;
  name: string;
  hostname: string;
  type: VMType;
  hostServerId: string | null;
  os: string;
  cpuCores: number;
  ramGB: number;
  diskGB: number;
  responsibleEmployeeId: string | null;
  serviceResponsibleEmployeeId: string | null;
  networkInterfaces: NetworkInterface[];
  status: 'running' | 'stopped' | 'maintenance' | 'decommissioned';
  /** Роль ВМ в системе виртуализации (например, консоль управления — vCenter как ВМ) */
  serverRole?: ServerRole | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  history?: HistoryEntry[];
  services?: Service[];
}

// Сервис/middleware на виртуальной машине
export interface Service {
  id: string;
  virtualMachineId: string;
  name: string;
  version: string;
  // Порт(ы) сервиса. Строка поддерживает несколько портов через запятую,
  // например "80, 443" (nginx). Старые числовые значения совместимы на чтение.
  port: string | number | null;
  description: string;
  status: 'active' | 'inactive' | 'maintenance';
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Разбирает поле порта сервиса (строка "80, 443", число или null) в массив чисел.
export function parsePortList(port: string | number | null | undefined): number[] {
  if (port === null || port === undefined || port === '') return [];
  const parts = String(port).split(/[,;\/\s]+/).filter(Boolean);
  const nums = parts.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 65535);
  return [...new Set(nums)];
}

// Запись о передаче техники
export interface Assignment {
  id: string;
  equipmentId: string;
  employeeId: string;
  assignedBy: string;
  assignedDate: string;
  returnedDate: string | null;
  notes: string;
}

// Запись аудита
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userName: string;
  action: 'create' | 'update' | 'delete' | 'assign' | 'unassign';
  entityType: string;
  entityId: string;
  entityName: string;
  details: string;
  timestamp: string;
}

// Статистика дашборда
export interface DashboardStats {
  totalOrganizations: number;
  totalEmployees: number;
  activeEmployees: number;
  totalEquipment: number;
  assignedEquipment: number;
  unassignedEquipment: number;
  needsRepair: number;
  writtenOff: number;
  totalServers: number;
  totalVMs: number;
  runningVMs: number;
  byCategory: Record<EquipmentCategory, number>;
  byDepartment: Record<string, number>;
}

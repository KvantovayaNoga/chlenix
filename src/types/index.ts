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
  organizationId?: string | null; // Организация, к которой привязан пользователь
}

// Организация (создаётся пользователем после регистрации)
export type OrganizationLegalForm = 'OOO' | 'AO' | 'PAO' | 'IAO' | 'IPO' | 'PT' | 'GP' | 'ANO' | 'FGBU' | 'MBU' | 'IP';

export interface Organization {
  id: string;
  name: string;                 // Наименование организации
  legalForm: OrganizationLegalForm; // Организационно-правовая форма
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
  accountantName: string;       // Главный бухгалтер (ФИО)
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
  branchId: string;
  floor: string;
  room: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  history?: HistoryEntry[];
}

// Категории техники/имущества
export type EquipmentCategory =
  | 'computer'
  | 'monitor'
  | 'peripheral'
  | 'furniture'
  | 'server'
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
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  history?: HistoryEntry[];
}

// Сервис/middleware на виртуальной машине
export interface Service {
  id: string;
  virtualMachineId: string;
  name: string;
  version: string;
  port: number | null;
  description: string;
  status: 'active' | 'inactive' | 'maintenance';
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
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

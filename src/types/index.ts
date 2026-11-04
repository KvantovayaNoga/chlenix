// Роли пользователей (синхронизировано с enum Role в backend/prisma/schema.prisma)
export type UserRole = 'admin' | 'hr_specialist' | 'sysadmin' | 'materially_responsible' | 'viewer';

// Человекочитаемые названия ролей (единый источник для сайдбара, «Пользователей»,
// профиля и «О системе»)
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  hr_specialist: 'Специалист по кадрам',
  sysadmin: 'Системный администратор',
  materially_responsible: 'Мат. ответственное лицо',
  viewer: 'Пользователь',
};

// Запись истории изменений
export interface HistoryEntry {
  id: string;
  action: 'created' | 'updated' | 'assigned' | 'unassigned' | 'deleted';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedBy: string;
  changedAt: string;
  // Изменения, внесённые одним сохранением, объединены общим batchId:
  // запись-заголовок (fieldName === 'изменения') + детальные записи по полям.
  batchId?: string | null;
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
  organizationId?: string | null; // Активная организация пользователя (последняя сессия)
  organizationName?: string | null; // Название актуальной организации
  organizations?: UserOrganizationRef[]; // Все организации, в которых состоит пользователь
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
  // Карточка сотрудника, привязанная к учётной записи (для иерархии видимости оборудования)
  employee?: { id: string; departmentName: string; positionName: string } | null;
  /** true — привязанный сотрудник является руководителем организации:
   * пользователь наследует золотую звёздочку везде, где фигурирует. */
  isHeadEmployee?: boolean;
  // Иерархия видимости оборудования (рассчитана на сервере):
  // all — видно всё оборудование организации; employeeIds — id сотрудников,
  // чьё закреплённое оборудование видно (своё + подчинённые для начальника отдела)
  equipmentVisibility?: { all: boolean; employeeIds: string[] | null };
}

// Организация пользователя (членство в мультиорганизационной модели)
export interface UserOrganizationRef {
  id: string;
  name: string;
  shortName?: string | null;
  inn?: string;
  isActive: boolean; // Актуальная — где пользователь был в последней сессии
}

// Организация (создаётся пользователем после регистрации)
export type OrganizationLegalForm = 'OOO' | 'AO' | 'PAO' | 'IAO' | 'IPO' | 'PT' | 'GP' | 'ANO' | 'FGBU' | 'MBU' | 'IP';

export interface Organization {
  id: string;
  name: string;                 // Полное наименование организации
  legalForm: string | null;     // ОПФ — свободный текст (вводится вручную)
  shortName: string;            // Краткое наименование (обязательное)
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
  /** Руководитель организации — id карточки сотрудника из штатного расписания.
   * Поле необязательное; выбирается из выпадающего списка сотрудников. */
  directorEmployeeId?: string | null;
  directorName: string;         // ФИО руководителя (синхронизируется с карточкой сотрудника)
  directorPosition: string;     // Должность руководителя (берётся из карточки сотрудника)
  /** @deprecated Главный бухгалтер больше не указывается в карточке организации —
   * он определяется по штатному расписанию (должность среди сотрудников). */
  accountantName?: string;
  bankName: string;             // Наименование банка
  checkingAccount: string;      // Расчётный счёт
  correspondentAccount: string; // Корреспондентский счёт
  bik: string;                  // БИК
  taxSystem: string;            // Система налогообложения
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

// Справочник «Виды деятельности» (ОКВЭД).
// Логические сущности: основной вид (isMain=true, ровно один) и дополнительные.
export interface ActivityType {
  id: string;
  okved: string;              // ОКВЭД: максимум 6 цифр, два разделителя-точки (62.01.1)
  name: string;               // Наименование вида деятельности
  isMain: boolean;            // Является основным видом деятельности
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Внутренний справочник (подкатегория «Справочники → Внутренние справочники»).
// Создаётся администратором; используется в дальнейшем. Один справочник =
// наименование + набор записей (items).
export interface CustomDirectoryItem {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomDirectory {
  id: string;
  name: string;
  description: string | null;
  items: CustomDirectoryItem[];
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

// Справочник: дата-центры (ЦОД) — сторонние/облачные вычислительные мощности
export interface DataCenter {
  id: string;
  name: string;
  owner: string;
  address: string | null;
  description: string | null;
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
  // Организация карточки сотрудника (привязывается администратором/HR при
  // создании/редактировании)
  organizationId?: string | null;
  organization?: { id: string; name: string; shortName?: string | null } | null;
  email: string;
  // Телефоны
  workPhone: string;
  internalPhone: string;
  personalPhone: string;
  hireDate: string;
  birthDate?: string | null;   // день рождения (в UI — формат д.мм.гггг)
  avatar?: string | null;      // автосинхронизируется с аватаром привязанного пользователя
  userId?: string | null;      // привязка учётной записи пользователя (авто — по e-mail)
  linkedUser?: { id: string; fullName: string; email: string } | null;
  /** true — сотрудник выбран руководителем организации: в UI помечается
   * золотой звёздочкой и поднимается на первое место в списке сотрудников. */
  isHeadEmployee?: boolean;
  // Столбец «Организация»: актуальная организация привязанной учётной записи
  // (где пользователь был в последней сессии)
  userOrganization?: { organizationId: string | null; organizationName: string | null } | null;
  // Карточка: все организации привязанной учётной записи
  userOrganizations?: UserOrganizationRef[];
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
// Позволяет описать инфраструктуру: хосты гипервизора, СХД, консоли управления, кластеры.
export type ServerRole = 'hypervisor_host' | 'storage' | 'management_console' | 'standalone' | 'cluster';

// Тип системы хранения (для роли «СХД»): SAN — выделенная СХД по FC/iSCSI,
// NAS — сетевое хранилище (NFS/SMB), HCI — гиперконвергентная (Ceph, vSAN, StarWind).
export type StorageSystemType = 'san' | 'nas' | 'hci';

// Протокол доступа к хранилищу, на котором работает платформа виртуализации.
export type StorageProtocol = 'iscsi' | 'fc' | 'fcoe' | 'nfs' | 'smb' | 'sas' | 'nvmeof' | 'vsan' | 'ceph';

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
  /** Статусная модель оборудования (в UI — «Статус»), см. src/utils/equipmentStatus.ts */
  condition: 'exploitation' | 'exploitation_restricted' | 'reserve' | 'repair' | 'removed_from_register' | 'lost_stolen' | 'unfit' | 'for_writeoff';
  /** Дефект или причина ограничений; обязателен при статусе exploitation_restricted */
  defectNote?: string | null;
  assignedToEmployeeId: string | null;
  /** ФИО сотрудника, закреплённого за оборудованием (сервер отдаёт вложенный объект) */
  assignedToEmployee?: { id: string; firstName: string; lastName: string; middleName?: string } | null;
  /** МОЛ — материально ответственное лицо, на подотчёте которого числится оборудование */
  materiallyResponsibleEmployeeId?: string | null;
  materiallyResponsibleEmployee?: { id: string; firstName: string; lastName: string; middleName?: string } | null;
  // Расположение: филиал (branchId) ИЛИ внешний/облачный ЦОД (dataCenterId).
  // Для физической техники — всегда филиал; ЦОД доступен кластерам виртуализации.
  branchId: string | null;
  dataCenterId?: string | null;
  locationType?: 'branch' | 'data_center' | null;
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
  /** Имя кластера ВМ (vSphere HA Cluster, Proxmox Ceph-cluster…) — группировка хостов внутри гипервизора */
  clusterName?: string | null;
  /** Версия гипервизора на хосте (ESXi 8.0 U2, PVE 8.2…) */
  hypervisorVersion?: string | null;
  /** Тип СХД: SAN / NAS / HCI */
  storageType?: StorageSystemType | null;
  /** Протокол доступа к СХД: iSCSI / FC / NFS / SMB / SAS / NVMe-oF */
  storageProtocol?: StorageProtocol | null;
  /** Полезный объём СХД, ГБ */
  storageCapacityGB?: number | null;
  /** Кластер-сервер (serverRole === 'cluster'), внутрь которого помещён этот сервер/СХД (косяк 11) */
  parentClusterId?: string | null;
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
  /** Кластер ВМ не хранится явно: определяется автоматически по хост-серверу
   *  (hostServer.parentClusterId). Поле clusterId удалено из модели и формы ВМ. */
  /** Вычисляемое поле бэкенда: id кластера, к которому относится ВМ через хост. */
  vmClusterId?: string | null;
  os: string;
  cpuCores: number;
  ramGB: number;
  diskGB: number;
  responsibleEmployeeId: string | null;
  serviceResponsibleEmployeeId: string | null;
  /** МОЛ — материально ответственное лицо, на подотчёте которого числится ВМ */
  materiallyResponsibleEmployeeId?: string | null;
  materiallyResponsibleEmployee?: { id: string; firstName: string; lastName: string; middleName?: string } | null;
  networkInterfaces: NetworkInterface[];
  status: 'running' | 'stopped' | 'maintenance' | 'decommissioned';
  /** Роль ВМ в системе виртуализации (например, консоль управления — vCenter как ВМ) */
  serverRole?: ServerRole | null;
  /** Назначенный хост гипервизора (thin provisioning) */
  provisionedOn?: string | null;
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

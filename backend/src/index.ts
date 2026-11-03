// ============================================================
// Chlenix Backend API — Main Entry Point
// Node.js 22 + Hono + Prisma + PostgreSQL
// Все данные приложения хранятся в серверной БД PostgreSQL.
// ============================================================

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// ============================================================
// Типы
// ============================================================
type Env = {
  Variables: {
    user: {
      userId: string;
      email: string;
      role: string;
      fullName: string;
      organizationId: string | null;
    };
  };
};

// ============================================================
// Инициализация
// ============================================================
const app = new Hono<Env>();
const prisma = new PrismaClient();

// Структурированное операционное логирование
const log = {
  info: (msg: string) => console.info(`[${new Date().toISOString()}] INFO  ${msg}`),
  error: (msg: string, err?: unknown) => console.error(`[${new Date().toISOString()}] ERROR ${msg}`, err ?? ''),
};

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW && process.env.NODE_ENV === 'production') {
  console.error('Ошибка запуска: в production обязателен JWT_SECRET.');
  console.error('   Задайте его в .env (генерация: openssl rand -base64 48).');
  process.exit(1);
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || 'dev_only_secret_do_not_use_in_production');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// CORS: '*' (по умолчанию) либо список точных origins через запятую.
// Запросы идут через nginx с тем же origin, что и фронтенд, поэтому
// значение по умолчанию безопасно для same-site депоя за прокси.
const CORS_ORIGIN_RAW = process.env.CORS_ORIGIN || '*';
const corsOrigins = CORS_ORIGIN_RAW.split(',').map((s) => s.trim()).filter(Boolean);

// ============================================================
// Middleware
// ============================================================
app.use('*', logger());
app.use('/api/*', cors({
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  credentials: !corsOrigins.includes('*'),
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Глобальный обработчик необработанных reject'ов: Node.js >=15 завершает
// процесс по умолчанию — это приводило к рестартам backend и «плавающим»
// 502 Bad Gateway на /api/auth/register. Логируем и живём дальше.
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection (process kept alive)', reason);
});
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception (process kept alive)', err);
});

// Единая обработка ошибок (не отдаём внутренние детали клиенту)
app.onError((err, c) => {
  log.error('Unhandled error', err);
  return c.json({ error: 'Внутренняя ошибка сервера' }, 500);
});

// Middleware для аутентификации
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const token = authHeader.split(' ')[1];
    const { payload } = await jwtVerify(token, JWT_SECRET);
    // Принудительный разлогин при переносе в другую организацию: токен несёт
    // версию (tv), актуальная версия хранится в БД. Если пользователь был
    // перемещён администратором (или исключён из организации) — tv не совпадёт,
    // все старые сессии гаснут, и при следующем входе он попадёт в новую организацию.
    const tv = Number((payload as any).tv ?? 0);
    const account = await prisma.user.findUnique({
      where: { id: (payload as any).userId },
      select: { tokenVersion: true, isActive: true, organizationId: true },
    });
    if (!account) {
      return c.json({ error: 'Сессия недействительна. Войдите заново.' }, 401);
    }
    // Блокировка учётной записи гасит ВСЕ её сессии мгновенно (п.4): версия
    // токена поднимается при блокировке, поэтому здесь возвращаем понятную
    // причину, а не общее «Сессия недействительна».
    if (!account.isActive) {
      return c.json({ error: 'Ваша учётная запись заблокирована. Обратитесь к администратору.' }, 401);
    }
    if (account.tokenVersion !== tv) {
      return c.json({ error: 'Сессия недействительна. Войдите заново.' }, 401);
    }
    // Активная организация всегда берётся из БД — актуальная из последней сессии
    c.set('user', { ...(payload as any), organizationId: account.organizationId ?? null });
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

// ============================================================
// Роли и матрица прав (синхронизировано с UI: src/store/authStore.tsx)
// ============================================================
const ALL_ROLES = ['admin', 'hr_specialist', 'sysadmin', 'materially_responsible', 'viewer'] as const;
type AppRole = (typeof ALL_ROLES)[number];

// Middleware для проверки роли
const requireRole = (roles: string[]) => {
  return async (c: any, next: any) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  };
};

/** Все роли, кроме «Пользователь» (viewer) — т.е. любые права на запись. */
const EDITOR_ROLES = ALL_ROLES.filter((r) => r !== 'viewer');
/** Право создавать организации: администратор системы и специалист по кадрам. */
const ORG_CREATE_ROLES: string[] = ['admin', 'hr_specialist'];
/** Полное управление сотрудниками (CRUD): admin + HR. */
const EMPLOYEE_MANAGE_ROLES: string[] = ['admin', 'hr_specialist'];
/** Право менять активную организацию (switch-organization): admin + HR.
 *  Решение от 2026-11: МОЛ, системный администратор и пользователь — без такого права. */
const ORG_SWITCH_ROLES: string[] = ['admin', 'hr_specialist'];
/** Редактирование карточек оборудования: admin + HR (МОЛ — только связка assign/unassign). */
const EQUIPMENT_MANAGE_ROLES: string[] = ['admin', 'hr_specialist'];
/**
 * Создание нового оборудования: только admin (+ sysadmin — инфраструктурная
 * техника, см. isInfraEquipment). Решение от 2026-11: специалист по кадрам
 * оборудование НЕ добавляет (ни в «Оборудовании», ни где-либо ещё);
 * редактирование существующих карточек за HR сохранено.
 */
const EQUIPMENT_CREATE_ROLES: string[] = ['admin'];
/**
 * Инфраструктурная техника (роль в виртуализации задана): её заводит системный
 * администратор (уточняя данные у МОЛ), поэтому sysadmin допущен к create/update
 * таких карточек. Обычное офисное оборудование (роль не задана) sysadmin
 * не создаёт и не правит — проверка isInfraEquipment в обработчиках /api/equipment.
 */
const isInfraEquipment = (serverRole?: string | null) => Boolean(serverRole);
/** Связка «сотрудник ↔ оборудование»: admin, HR, МОЛ. */
const ASSIGN_ROLES: string[] = ['admin', 'hr_specialist', 'materially_responsible'];
/** Серверные разделы (физические серверы / ВМ / платформы виртуализации): admin + системный администратор. */
const SERVER_ROLES: string[] = ['admin', 'sysadmin'];

/** Роль пользователя из JWT-payload (c.get('user').role). */
const roleOf = (c: any): string => c.get('user')?.role ?? '';

/**
 * Права на справочники (отделы/должности/филиалы/ЦОД) по ролям:
 * - admin          — всё;
 * - hr_specialist  — отделы/должности/филиалы (полностью), ЦОД — только просмотр;
 * - sysadmin       — ЦОД (полностью), остальные — только просмотр;
 * - остальные      — только просмотр.
 */
function canEditDirectory(role: string, model: string): boolean {
  if (role === 'admin') return true;
  if (role === 'hr_specialist') return model !== 'dataCenter';
  if (role === 'sysadmin') return model === 'dataCenter';
  return false;
}

// ============================================================
// Вспомогательные функции: аудит и история изменений
// ============================================================
type Ctx = { userId: string; fullName: string };

async function writeAudit(ctx: Ctx, action: string, entityType: string, entityId: string | null, entityName: string | null, details: string, ipAddress?: string | null) {
  await prisma.auditLog.create({
    data: {
      userId: ctx.userId,
      userName: ctx.fullName,
      action: action as any,
      entityType,
      entityId,
      entityName,
      details,
      ipAddress: ipAddress ?? null,
    },
  });
}

const HISTORY_FIELD_LABELS: Record<string, string> = {
  name: 'наименование',
  hostname: 'hostname',
  os: 'ОС',
  type: 'тип',
  status: 'статус',
  cpuCores: 'CPU (ядер)',
  ramGB: 'RAM (ГБ)',
  diskGB: 'диск (ГБ)',
  serialNumber: 'серийный номер',
  inventoryNumber: 'инвентарный номер',
  brand: 'бренд',
  model: 'модель',
  condition: 'состояние',
  category: 'категория',
  floor: 'этаж',
  room: 'кабинет',
  notes: 'примечания',
  firstName: 'имя',
  lastName: 'фамилия',
  middleName: 'отчество',
  email: 'email',
  workPhone: 'рабочий телефон',
  internalPhone: 'внутренний телефон',
  personalPhone: 'личный телефон',
  hireDate: 'дата приёма',
  isEmployed: 'статус работы',
  positionId: 'должность',
  departmentId: 'отдел',
  branchId: 'филиал',
  hostServerId: 'хост-сервер',
  serverRole: 'роль в виртуализации',
  hypervisorName: 'гипервизор',
  clusterName: 'кластер',
  hypervisorVersion: 'версия гипервизора',
  storageType: 'тип СХД',
  storageProtocol: 'протокол СХД',
  storageCapacityGB: 'объём СХД, ГБ',
  parentClusterId: 'кластер (родитель)',
  provisionedOn: 'назначенный хост',
  responsibleEmployeeId: 'ответственный (инфраструктура)',
  serviceResponsibleEmployeeId: 'ответственный (сервисы)',
  materiallyResponsibleEmployeeId: 'МОЛ (мат. ответственное лицо)',
  // Примечание: для оборудования branchId/dataCenterId объединяются в одну
  // запись «место размещения» (см. locationLabel в applyUpdate); здесь
  // остаются базовые подписи для остальных моделей (сотрудник, ЦОД и т.п.).
  owner: 'владелец/эксплуатирующая организация',
  birthDate: 'дата рождения',
  userId: 'привязанный пользователь',
  description: 'описание',
  address: 'адрес',
  shortName: 'краткое наименование',
  legalForm: 'ОКФ',
  inn: 'ИНН',
  kpp: 'КПП',
  ogrn: 'ОГРН',
  legalAddress: 'юридический адрес',
  actualAddress: 'фактический адрес',
  postalCode: 'почтовый индекс',
  city: 'город',
  phone: 'телефон',
  website: 'сайт',
  directorName: 'руководитель',
  bankName: 'банк',
  checkingAccount: 'расчётный счёт',
  correspondentAccount: 'корр. счёт',
  bik: 'БИК',
  taxSystem: 'система налогообложения',
  industry: 'отрасль',
  employeeCount: 'штатная численность',
  foundedDate: 'дата основания',
  logo: 'логотип',
  avatar: 'аватар',
  fullName: 'ФИО',
  role: 'роль',
  isActive: 'активность',
  organizationId: 'организация',
  theme: 'тема оформления',
  password: 'пароль',
  version: 'версия',
  port: 'порт',
  macAddress: 'MAC-адрес',
  ipAddress: 'IP-адрес',
  isPublic: 'публичный IP',
  purchaseDate: 'дата покупки',
  writeOffDate: 'дата списания',
  dataCenterId: 'ЦОД',
  // Физические серверы (Equipment) и виртуальные машины (VirtualMachine):
  // без этих подписей diff молча пропускал поля (TRACKED_KEYS строится из ключей).
  locationType: 'тип размещения',
  vmClusterId: 'кластер (виртуальный)',
};

// Человекочитаемые переводы значений enum-полей (в базе значения хранятся по-английски).
const VALUE_TRANSLATIONS: Record<string, Record<string, string>> = {
  // Синхронно с enum Condition (prisma) и подписями в EquipmentCardModal.
  condition: {
    new: 'новый',
    good: 'хорошее',
    satisfactory: 'удовлетворительное',
    needs_repair: 'требует ремонта',
    written_off: 'списано',
  },
  // Синхронно с enum EquipmentCategory.
  category: {
    computer: 'компьютер',
    monitor: 'монитор',
    peripheral: 'периферия',
    furniture: 'мебель',
    server: 'сервер',
    storage: 'СХД',
    virtual_machine: 'виртуальная машина',
    network: 'сетевое оборудование',
    phone: 'телефон',
    other: 'прочее',
  },
  // Роли в виртуализации (Equipment.serverRole / VirtualMachine.serverRole).
  serverRole: {
    hypervisor_host: 'хост гипервизора',
    storage: 'СХД',
    management_console: 'консоль управления',
    standalone: 'автономный сервер',
    cluster: 'кластер',
  },
  // Статус ВМ (enum VMStatus).
  status: {
    running: 'запущена',
    stopped: 'остановлена',
    maintenance: 'в обслуживании',
    decommissioned: 'выведена из эксплуатации',
  },
  // Тип ВМ (enum VMType).
  type: {
    virtual: 'виртуальная машина',
    container: 'контейнер',
    cloud: 'облачная',
  },
  // Роли пользователей системы — синхронно с enum Role и ROLE_LABELS фронтенда.
  role: {
    admin: 'Администратор',
    hr_specialist: 'Специалист по кадрам',
    sysadmin: 'Системный администратор',
    materially_responsible: 'Мат. ответственное лицо',
    viewer: 'Пользователь',
  },
  // Тема оформления профиля.
  theme: {
    light: 'светлая',
    dark: 'тёмная',
    system: 'системная',
  },
  // Тип СХД (Equipment.storageType).
  storageType: {
    san: 'SAN',
    nas: 'NAS',
    hci: 'HCI',
  },
  // Протокол СХД (Equipment.storageProtocol).
  storageProtocol: {
    iscsi: 'iSCSI',
    fc: 'Fibre Channel',
    fcoe: 'FCoE',
    nfs: 'NFS',
    smb: 'SMB',
    sas: 'SAS',
    nvmeof: 'NVMe-oF',
    vsan: 'vSAN',
    ceph: 'Ceph',
  },
  // Тип местоположения (Equipment.locationType).
  locationType: {
    branch: 'филиал',
    data_center: 'ЦОД',
  },
};

// Поля, где uuid может встречаться и вне реестра REF_FIELD_MODELS (например,
// «удалённый» филиал у сотрудника): в историю такие ID писать нельзя.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function displayValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'string') {
    const tr = VALUE_TRANSLATIONS[key]?.[v];
    if (tr) return tr;
    // UUID никогда не пишем в историю как значение — только служебную пометку.
    if (UUID_RE.test(v)) return 'запись удалена';
  }
  return String(v);
}

// Вычисляет diff по белому списку отслеживаемых полей и пишет историю + аудит
const TRACKED_KEYS = Object.keys(HISTORY_FIELD_LABELS);

// Ссылочные поля (внешние ключи): в историю пишем человекочитаемые значения —
// ФИО сотрудников, названия филиалов/ЦОД/отделов/должностей/организаций, а не uuid.
type RefModel = 'employee' | 'branch' | 'dataCenter' | 'department' | 'position' | 'organization' | 'equipment';
// Примечание: 'user' добавлен union-ом ниже, чтобы поддерживать userId в карточке сотрудника.
const REF_FIELD_MODELS: Record<string, RefModel | 'user' | (RefModel | 'user')[]> = {
  assignedToEmployeeId: 'employee',
  materiallyResponsibleEmployeeId: 'employee',
  responsibleEmployeeId: 'employee',
  serviceResponsibleEmployeeId: 'employee',
  branchId: 'branch',
  dataCenterId: 'dataCenter',
  departmentId: 'department',
  positionId: 'position',
  organizationId: 'organization',
  parentClusterId: 'equipment',
  hostServerId: 'equipment',
  // Привязка учётной записи в карточке сотрудника: пишем ФИО пользователя, а не uuid.
  userId: 'user',
};

// Краткая человекочитаемая подпись записи по имени модели справочника.
async function refDisplayName(model: RefModel | 'user', id: string): Promise<string | null> {
  const rec: any = await (prisma as any)[model].findUnique({ where: { id } });
  if (!rec) return null;
  if (model === 'employee') {
    const fio = [rec.lastName, rec.firstName, rec.middleName].filter(Boolean).join(' ');
    return fio || rec.name || 'сотрудник (удалён)';
  }
  if (model === 'user') return rec.fullName || 'пользователь (без имени)';
  if (model === 'equipment') return rec.name || 'оборудование (без имени)';
  return rec.name || rec.shortName || null;
}

async function historyDisplayValue(key: string, value: any): Promise<string> {
  if (value === null || value === undefined || value === '') return '—';
  const models = REF_FIELD_MODELS[key];
  if (models && typeof value === 'string' && UUID_RE.test(value)) {
    for (const model of Array.isArray(models) ? models : [models]) {
      try {
        const name = await refDisplayName(model, value);
        if (name) return name;
      } catch { /* запись недоступна — пробуем следующего кандидата */ }
    }
    return 'запись удалена';
  }
  return displayValue(key, value);
}

// Человекочитаемое «место размещения» оборудования: филиал ИЛИ ЦОД одной
// строкой («филиал: Северный», «ЦОД: Москва-1»), иначе история показывала бы
// два отдельных изменения с «—» и название без указания типа.
async function locationLabel(oldObj: Record<string, any>, newObj: Record<string, any>): Promise<string | null> {
  const resolve = async (obj: Record<string, any>): Promise<string> => {
    if (obj.dataCenterId) {
      const name = await historyDisplayValue('dataCenterId', obj.dataCenterId);
      return `ЦОД: ${name}`;
    }
    if (obj.branchId) {
      const name = await historyDisplayValue('branchId', obj.branchId);
      return `филиал: ${name}`;
    }
    return '—';
  };
  const before = await resolve(oldObj);
  const after = await resolve(newObj);
  if (before === after) return null;
  return `${before} → ${after}`;
}

// Поля с бинарными/большими данными (data-URL аватара/логотипа): в историю
// пишем только факт изменения («Загружен/изменён/удалён аватар»), сами base64
// хеши в diff не попадают.
const MEDIA_FIELDS: Record<string, string> = {
  avatar: 'аватар',
  logo: 'логотип',
};

async function applyUpdate(opts: {
  ctx: Ctx;
  ipAddress?: string | null;
  entityType: string;
  entityId: string;
  entityName: string;
  oldObj: Record<string, any>;
  newData: Record<string, any>;
  // Состав кластера «до/после» (списки id членов) — для записи изменений
  // состава в историю (кластер редактируется отдельным механизмом __members).
  clusterMembersBefore?: string[];
  clusterMembersAfter?: string[];
  // Дополнительно к diff по полям: готовые изменения (например, смена пароля,
  // значение которого не пишется в историю). Попадают в ту же группу batchId.
  extraChanges?: { field: string; oldValue: string; newValue: string; summary: string }[];
}) {
  // Все изменения одного сохранения группируются в одну запись истории:
  // «запись-заголовок» (краткий список затронутых полей) + детальные записи
  // «поле: было X → стало Y», объединённые общим batchId. Фронтенд
  // (HistoryLog) показывает заголовок, а детали раскрывает по клику.
  type ChangeItem = { field: string; oldValue: string; newValue: string; summary: string };
  const items: ChangeItem[] = [];
  // Краткая подпись для заголовка группы: до 30 символов, многострочные и
  // длинные значения («добавлен: …») сокращаются до первого слова/строки.
  const brief = (s: string) => {
    const firstLine = s.split('\n')[0].trim();
    const short = firstLine.split(' ')[0] || firstLine;
    const pick = short.length <= 24 ? short : firstLine;
    return pick.length > 30 ? pick.slice(0, 29) + '…' : pick;
  };
  const norm = (v: any) => {
    if (v instanceof Date) return v.toISOString();
    if (v === undefined || v === null || v === '') return '';
    return String(v);
  };
  // Добавляет изменение в группу (без записи в БД — всё запишем одним
  // батчем после обхода полей; сбой БД не должен отменять сохранение).
  const recordChange = (fieldName: string, oldValue: string, newValue: string) => {
    items.push({ field: fieldName, oldValue, newValue, summary: `${fieldName}: "${oldValue}" → "${newValue}"` });
  };
  if (opts.extraChanges?.length) items.push(...opts.extraChanges);
  for (const key of TRACKED_KEYS) {
    if (!(key in opts.newData)) continue;
    // «Место размещения» обрабатывается ниже одной объединённой записью
    // (филиал ИЛИ ЦОД), пропускаем его ключи в обычном diff.
    if (opts.entityType === 'equipment' && (key === 'branchId' || key === 'dataCenterId' || key === 'locationType')) continue;
    // Кластер ВМ определяется автоматически по хост-серверу (vmClusterId —
    // вычисляемое поле): отдельной записью в истории не нужен, изменение
    // размещения и так фиксируется строкой «хост-сервер».
    if (key === 'vmClusterId') continue;
    // locationType — производное от branchId/dataCenterId поле: отдельной
    // записью не нужен, размещение и так фиксируется строкой «место размещения».
    if (key === 'locationType') continue;
    const nv = opts.newData[key];
    // null означает «значение сброшено» и должно попадать в diff;
    // undefined — поле не передавалось, пропускаем.
    if (nv === undefined) continue;
    const ov = opts.oldObj[key];

    // Унификация типов перед сравнением: числа из БД (Int/Float) приходят как
    // number, а из формы строками ('16'), null и '' — одно и то же «пустое»
    // значение. Без этого изменения числовых полей (этаж, кабинет, RAM…)
    // молча терялись: сравнение строк считало их «равными».
    const coerce = (v: any): any => {
      if (v === undefined || v === null || v === '') return null;
      if (typeof v === 'string') {
        const t = v.trim();
        if (/^-?\d+(?:[.,]\d+)?$/.test(t)) return parseFloat(t.replace(',', '.'));
      }
      return v;
    };
    const same = (a: any, b: any) => {
      const ca = coerce(a);
      const cb = coerce(b);
      if (ca === cb) return true;
      if (typeof ca === 'number' && typeof cb === 'number') return Number.isNaN(ca) && Number.isNaN(cb) ? true : ca === cb;
      if (ca instanceof Date || cb instanceof Date) return norm(a) === norm(b);
      if (ca === null || cb === null) return false;
      if (typeof ca === 'boolean' || typeof cb === 'boolean') return Boolean(ca) === Boolean(cb);
      return String(ca) === String(cb);
    };
    if (!same(ov, nv)) {
      // Медиа-поля (аватар/логотип): без содержимого — только человекочитаемый факт.
      const mediaLabel = MEDIA_FIELDS[key];
      if (mediaLabel) {
        const hadOld = norm(ov) !== '';
        const hasNew = norm(nv) !== '';
        const verb = !hadOld && hasNew ? `Загружен ${mediaLabel}`
          : hadOld && !hasNew ? `Удалён ${mediaLabel}`
            : `Изменён ${mediaLabel}`;
        items.push({
          field: mediaLabel,
          oldValue: hadOld ? 'присутствовал' : '—',
          newValue: hasNew ? 'присутствует' : '—',
          summary: verb,
        });
        continue;
      }
      const oldLabel = await historyDisplayValue(key, ov);
      const newLabel = await historyDisplayValue(key, nv);
      recordChange(HISTORY_FIELD_LABELS[key], oldLabel, newLabel);
    }
  }

  // Место размещения оборудования одной понятной строкой: «филиал: X → ЦОД: Y».
  if (opts.entityType === 'equipment' && ('branchId' in opts.newData || 'dataCenterId' in opts.newData)) {
    const merged = await locationLabel(opts.oldObj, { ...opts.oldObj, ...opts.newData });
    if (merged) {
      const [before, ...rest] = merged.split(' → ');
      recordChange('место размещения', before, rest.join(' → '));
    }
  }

  // Состав кластера: ClusterForm меняет parentClusterId у членов кластера прямым
  // запросом (applyClusterMembers), мимо diff по полям. Если состав передавался
  // явно — сравниваем его со старым и дописываем в историю понятные строки
  // «добавлен/исключён» с названиями оборудования (без uuid).
  if (opts.entityType === 'equipment' && opts.clusterMembersBefore === undefined
      && 'parentClusterId' in opts.newData) {
    // Отвязка/привязка через карточку самого члена кластера (поле «кластер
    // (родитель)»): фиксируем событие и в истории кластера, иначе изменение
    // состава было бы видно только в истории сервера, а не кластера.
    const beforeCid = opts.oldObj.parentClusterId ?? null;
    const afterCid = opts.newData.parentClusterId ?? null;
    if (!same(beforeCid, afterCid)) {
      const selfName = await historyDisplayValue('parentClusterId', opts.entityId);
      if (afterCid) {
        await writeHistoryBatch('equipment', String(afterCid), opts.ctx.fullName, [{
          field: 'состав кластера', oldValue: '—', newValue: `добавлен: ${selfName}`,
          summary: `состав кластера: "—" → "добавлен: ${selfName}"`,
        }]);
      }
      if (beforeCid) {
        await writeHistoryBatch('equipment', String(beforeCid), opts.ctx.fullName, [{
          field: 'состав кластера', oldValue: `исключён: ${selfName}`, newValue: '—',
          summary: `состав кластера: "исключён: ${selfName}" → "—"`,
        }]);
      }
    }
  }
  if (opts.entityType === 'equipment' && Array.isArray(opts.clusterMembersBefore)) {
    const beforeIds = opts.clusterMembersBefore;
    const afterIds = opts.clusterMembersAfter ?? [];
    const before = new Set(beforeIds);
    const after = new Set(afterIds);
    const added = afterIds.filter((id) => !before.has(id));
    const removed = beforeIds.filter((id) => !after.has(id));
    const changedIds = [...new Set([...added, ...removed])];
    const named = new Map<string, string>();
    if (changedIds.length > 0) {
      const items_ = await prisma.equipment.findMany({ where: { id: { in: changedIds } }, select: { id: true, name: true } });
      for (const it of items_) named.set(it.id, it.name || 'оборудование (без имени)');
    }
    for (const id of added) {
      recordChange('состав кластера', '—', `добавлен: ${named.get(id) ?? 'оборудование (удалено)'}`);
    }
    for (const id of removed) {
      recordChange('состав кластера', `исключён: ${named.get(id) ?? 'оборудование (удалено)'}`, '—');
    }
  }

  // Запись группы изменений в историю ОДНОЙ записью-заголовком + детализация
  // (см. writeHistoryBatch).
  if (items.length > 0) {
    await writeHistoryBatch(opts.entityType, opts.entityId, opts.ctx.fullName, items);
  }

  await writeAudit(
    opts.ctx,
    'update',
    opts.entityType,
    opts.entityId,
    opts.entityName,
    items.length > 0 ? `Обновлено: ${items.map((i) => i.summary).join('; ')}` : 'Обновлены данные',
    opts.ipAddress,
  );
}

// Пишет группу изменений одной записью-заголовком + детализацией:
//   главная запись: fieldName='изменения', newValue='Обновлено: поле1, поле2…';
//   детальные записи: по одному полю «было X → стало Y», тот же batchId.
// Фронтенд (HistoryLog) группирует по batchId: в списке виден только
// заголовок, детали раскрываются в модальном окне по клику.
// Используется и applyUpdate, и отдельными маршрутами (организации
// пользователя), чтобы весь журнал был в едином формате.
async function writeHistoryBatch(
  entityType: string,
  entityId: string,
  changedBy: string,
  items: { field: string; oldValue?: string | null; newValue?: string | null }[],
): Promise<void> {
  if (items.length === 0) return;
  // Краткая подпись для заголовка группы: до 30 символов, многострочные и
  // длинные значения («добавлен: …») сокращаются до первого слова/строки.
  const brief = (s: string) => {
    const firstLine = s.split('\n')[0].trim();
    const short = firstLine.split(' ')[0] || firstLine;
    const pick = short.length <= 24 ? short : firstLine;
    return pick.length > 30 ? pick.slice(0, 29) + '…' : pick;
  };
  try {
    const batchId = crypto.randomUUID();
    const fieldNames = [...new Set(items.map((i) => i.field))];
    const headline = fieldNames.map((f) => brief(f)).join(', ');
    await prisma.historyRecord.create({
      data: {
        entityType,
        entityId,
        action: 'updated',
        fieldName: 'изменения',
        oldValue: null,
        newValue: `Обновлено: ${headline} (${items.length})`,
        changedBy,
        batchId,
      },
    });
    await prisma.historyRecord.createMany({
      data: items.map((i) => ({
        entityType,
        entityId,
        action: 'updated',
        fieldName: i.field,
        oldValue: i.oldValue ?? null,
        newValue: i.newValue ?? null,
        changedBy,
        batchId,
      })),
    });
  } catch (e) {
    // Сбой записи истории не должен отменять уже сохранённое обновление.
    console.error(`history write failed for ${entityType}:`, e);
  }
}

async function createHistoryEntry(entityType: string, entityId: string, changedBy: string, action = 'created', fieldName = 'создано') {
  await prisma.historyRecord.create({
    data: { entityType, entityId, action, fieldName, changedBy },
  });
}

// Разрешает внешние ключи из строковых ID, возвращает null если записи нет.
// Для справочников (branch/department/position) дополнительно проверяет
// принадлежность организации: запись либо привязана к orgId, либо общая (null).
async function resolveRef(model: 'employee' | 'branch' | 'department' | 'position' | 'equipment' | 'dataCenter', id: unknown, orgId?: string | null): Promise<string | null> {
  if (typeof id !== 'string' || id.trim() === '') return null;
  const where = { id };
  try {
    const found: any = await (prisma as any)[model].findUnique({ where, select: { id: true, organizationId: true } });
    if (!found) return null;
    if (orgId !== undefined && ['branch', 'department', 'position', 'dataCenter'].includes(model)) {
      if (found.organizationId && orgId && found.organizationId !== orgId) return null;
    }
    return found.id;
  } catch {
    return null;
  }
}

// Безопасно разрешает внешние ключи: undefined остаётся undefined (поле не меняется/не задаётся),
// пустое/несуществующее значение -> null
async function resolveRefOrNull(model: 'employee' | 'branch' | 'department' | 'position' | 'equipment' | 'dataCenter', id: unknown, orgId?: string | null): Promise<string | null | undefined> {
  if (id === undefined) return undefined;
  return await resolveRef(model, id, orgId);
}

// ============================================================
// Мультиорганизационность: скоуп и смена активной организации
// ============================================================
// Активная организация пользователя: та, к которой привязан пользователь.
async function getUserOrgScope(userId: string): Promise<{ orgId: string | null; role: string }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true, role: true } });
  return { orgId: u?.organizationId ?? null, role: u?.role ?? 'viewer' };
}

// ============================================================
// Видимость оборудования по организационной иерархии
// - обычный пользователь видит только оборудование, закреплённое за ним;
// - «Начальник отдела» — всё оборудование своих подчинённых + своё;
// - отдел «Руководство» — всё оборудование организации целиком;
// - admin/sysadmin/hr_specialist/materially_responsible — без ограничений
//   (у МОЛ доступ к закреплённому за ним оборудованию уже есть).
// ============================================================
const HEAD_POSITION_RE = /начальник|руководитель|заведующий|обозначение|ceo|cfo|cto|coo/i;
const LEADERSHIP_DEPT_RE = /руководств|гендирекц|дирекц|правлен|совет/i;

/** Служебные роли видят всё оборудование организации без ограничений. */
function roleExempt(role: string): boolean {
  return role === 'admin' || role === 'sysadmin' || role === 'hr_specialist' || role === 'materially_responsible';
}

type MeEmpInfo = { id: string; departmentId: string; positionName: string; departmentName: string } | null;

/** Карточка сотрудника, привязанного к учётной записи (в активной организации). */
async function getMyEmployeeInfo(userId: string, orgId: string | null): Promise<MeEmpInfo> {
  const meEmp = await prisma.employee.findFirst({
    where: { userId, ...(orgId ? { organizationId: orgId } : {}) },
    select: {
      id: true, departmentId: true,
      position: { select: { name: true } },
      department: { select: { name: true } },
    },
  });
  if (!meEmp) return null;
  return {
    id: meEmp.id,
    departmentId: meEmp.departmentId,
    positionName: meEmp.position?.name ?? '',
    departmentName: meEmp.department?.name ?? '',
  };
}

/** Id сотрудников, видимых текущему пользователю по иерархии (включая его самого). */
async function visibleEmployeeIdsFor(me: MeEmpInfo, orgId: string | null): Promise<string[]> {
  if (!me) return []; // нет карточки сотрудника — личного закрепления нет
  const ids = new Set<string>([me.id]);
  // Начальник отдела: все сотрудники того же отдела (подчинённые) + своё
  if (HEAD_POSITION_RE.test(me.positionName) && me.departmentId) {
    const deps = await prisma.employee.findMany({
      where: { departmentId: me.departmentId, ...(orgId ? { organizationId: orgId } : {}) },
      select: { id: true },
    });
    for (const d of deps) ids.add(d.id);
  }
  return Array.from(ids);
}

/** where-условие для выборки оборудования с учётом прав видимого набора сотрудников. */
async function equipmentVisibilityWhere(userId: string, role: string, orgId: string | null): Promise<any | null> {
  // null => никаких дополнительных ограничений (служебные роли)
  if (role === 'admin' || role === 'sysadmin' || role === 'hr_specialist' || role === 'materially_responsible') return null;
  const me = await getMyEmployeeInfo(userId, orgId);
  // Руководство видит всё оборудование организации целиком
  if (me?.departmentName && LEADERSHIP_DEPT_RE.test(me.departmentName)) return null;
  const empIds = await visibleEmployeeIdsFor(me, orgId);
  return { OR: [{ assignedToEmployeeId: { in: empIds } }, { materiallyResponsibleEmployeeId: { in: empIds } }] };
}

// Где может работать пользователь: организации, участником которых он является
// (таблица user_organizations) + активная организация из последней сессии
// (users.organization_id) + (для админа) все организации системы.
async function getAccessibleOrgs(userId: string): Promise<Array<{ id: string; name: string; isOwn: boolean; shortName?: string; legalAddress?: string; phone?: string; inn?: string; directorName?: string }>> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true, role: true } });
  const memberOrgIds = await getUserOrgIds(userId);
  // Активная организация (последняя сессия) всегда доступна, даже если запись
  // членства ещё не создана (например, у данных, созданных до миграции).
  if (me?.organizationId && !memberOrgIds.includes(me.organizationId)) memberOrgIds.push(me.organizationId);
  // Краткие реквизиты нужны для карточек на странице «Сменить организацию»
  const all = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, shortName: true, legalAddress: true, phone: true, inn: true, directorName: true },
  });
  const brief = (o: (typeof all)[number], isOwn: boolean) => ({
    id: o.id,
    name: o.name,
    isOwn,
    shortName: o.shortName ?? '',
    legalAddress: o.legalAddress ?? '',
    phone: o.phone ?? '',
    inn: o.inn ?? '',
    directorName: o.directorName ?? '',
  });
  if (me?.role === 'admin') return all.map((o) => brief(o, o.id === me.organizationId || memberOrgIds.includes(o.id)));
  return all.filter((o) => memberOrgIds.includes(o.id)).map((o) => brief(o, o.id === me?.organizationId));
}

// Приводит дату (Date | ISO-строка) к ISO-формату для ответов API
function isoDate(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? '');
}

// Преобразует запись истории БД в формат клиента
function publicHistory(h: any): any {
  return {
    id: h.id,
    action: h.action,
    fieldName: h.fieldName,
    oldValue: h.oldValue,
    newValue: h.newValue,
    changedBy: h.changedBy,
    changedAt: isoDate(h.createdAt),
    // Группировка одного сохранения: записи с равными batchId — изменения,
    // внесённые разом; заголовок группы имеет fieldName === 'изменения'.
    batchId: h.batchId ?? null,
  };
}

// Справочник: даты в ISO-строки для клиента
function publicDirectory(d: any): any {
  return { ...d, createdAt: isoDate(d.createdAt), updatedAt: isoDate(d.updatedAt) };
}

// ============================================================
// Health Check
// ============================================================
app.get('/api/health', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: 'error', timestamp: new Date().toISOString() }, 503);
  }
});

// ============================================================
// Auth Routes
// ============================================================
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  // Опционально: заявка на вступление в существующую организацию
  // (чекбокс «Присоединиться к существующей организации» на форме регистрации).
  joinOrganizationId: z.string().uuid().optional().nullable(),
});

async function getUserOrgIds(userId: string): Promise<string[]> {
  const rows = await prisma.userOrganization.findMany({ where: { userId }, select: { organizationId: true } });
  return rows.map((r) => r.organizationId);
}

// Гарантирует наличие записей членства пользователя в списке организаций
// (включая активную). Используется при самовступлении через переключение
// организации, а также как «мост» для данных, созданных до миграции:
// если у пользователя ещё нет ни одного членства, его текущая организация
// становится членством автоматически.
async function ensureMemberships(userId: string, organizationIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(organizationIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await prisma.userOrganization.createMany({
    data: ids.map((organizationId) => ({ userId, organizationId })),
    skipDuplicates: true,
  }).catch(() => {});
}

// Организации, в которых пользователь был привязан исторически (до внедрения
// таблицы членства): собираем из журнала изменений поля «организация».
// Нужны для «мягкой миграции»: при первом обращении к карточке пользователя
// прежние организации становятся его членствами.
async function getHistoricalOrgIds(userId: string): Promise<string[]> {
  const rows = await prisma.historyRecord.findMany({
    where: { entityType: 'user', entityId: userId, fieldName: { in: ['организация', 'организации'] } },
    select: { oldValue: true, newValue: true },
  });
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true, shortName: true } });
  const byLabel = new Map<string, string>();
  for (const o of orgs) {
    if (o.shortName) byLabel.set(o.shortName.toLowerCase(), o.id);
    byLabel.set(o.name.toLowerCase(), o.id);
  }
  const ids = new Set<string>();
  for (const r of rows) {
    // значения могут быть uuid (новые записи PUT) или именами организаций —
    // сопоставляем по имени/краткому имени; uuid проверяем напрямую
    for (const raw of [r.oldValue, r.newValue]) {
      if (typeof raw !== 'string') continue;
      for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) ids.add(part);
        else {
          const byName = byLabel.get(part.toLowerCase());
          if (byName) ids.add(byName);
        }
      }
    }
  }
  return [...ids];
}

// Инкремент версии токена — принудительный разлогин всех активных сессий
// пользователя (используется при переносе в другую организацию).
async function bumpTokenVersion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

// Публичное представление пользователя + список его организаций (для карточки
// и столбца «Организация» в списке сотрудников/пользователей).
// organizations — результат include memberships.organization (или null, если
// данные не запрашивались — тогда подтягиваем отдельно).
async function withUserOrgs(u: any, orgs?: any[] | null) {
  let list = orgs;
  if (list == null) {
    const ids = await getUserOrgIds(u.id);
    if (u.organizationId && !ids.includes(u.organizationId)) ids.push(u.organizationId);
    list = ids.length
      ? await prisma.organization.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' } })
      : [];
  }
  return {
    ...publicUser(u),
    // Актуальная организация — та, где пользователь был в последней сессии
    organizationName: u.organizationId
      ? (list.find((o: any) => o.id === u.organizationId)?.shortName
         || list.find((o: any) => o.id === u.organizationId)?.name
         || null)
      : null,
    organizations: list.map((o: any) => ({
      id: o.id,
      name: o.name,
      shortName: o.shortName ?? null,
      inn: o.inn ?? '',
      isActive: o.id === u.organizationId,
    })),
  };
}

function publicUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    avatar: u.avatar ?? undefined,
    theme: u.theme ?? 'system',
    organizationId: u.organizationId ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function issueToken(user: any) {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    organizationId: user.organizationId ?? null,
    // Версия токена: инвалидация старых сессий при переносе между организациями
    tv: user.tokenVersion ?? 0,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

app.post('/api/auth/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return c.json({ error: 'Неверный email или пароль' }, 401);
  }
  // Понятная ошибка вместо «Неверный email или пароль» для заблокированной учётки (п.3)
  if (!user.isActive) {
    return c.json({ error: 'Пользователь заблокирован. Обратитесь к администратору.' }, 403);
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return c.json({ error: 'Неверный email или пароль' }, 401);
  }

  const token = await issueToken(user);

  await writeAudit(
    { userId: user.id, fullName: user.fullName },
    'login',
    'user',
    user.id,
    user.fullName,
    'Вход в систему',
    c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
  );

  // При входе возвращаем и список организаций пользователя (актуальная —
  // organizationId, та, где он был в последней сессии).
  return c.json({ token, user: await withUserOrgs(user) });
});

app.post('/api/auth/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }

  const { email, password, fullName, joinOrganizationId } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return c.json({ error: 'Пользователь с таким email уже существует' }, 400);
  }

  // Первый зарегистрированный пользователь — администратор системы
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? 'admin' : 'viewer';

  // Заявка на вступление: проверяем, что организация существует.
  let joinOrg: { id: string; shortName: string | null; name: string } | null = null;
  if (joinOrganizationId) {
    joinOrg = await prisma.organization.findUnique({
      where: { id: joinOrganizationId },
      select: { id: true, shortName: true, name: true },
    });
    if (!joinOrg) {
      return c.json({ error: 'Выбранная организация не найдена' }, 400);
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, password: passwordHash, fullName, role },
  });

  if (joinOrg) {
    await prisma.joinRequest.create({
      data: { applicantId: user.id, organizationId: joinOrg.id },
    });
  }

  await createHistoryEntry('user', user.id, fullName);
  await writeAudit({ userId: user.id, fullName }, 'create', 'user', user.id, fullName, 'Зарегистрирован новый пользователь');

  const token = await issueToken(user);

  return c.json({
    token,
    user: publicUser(user),
    // Флаг для клиента: учётная запись создана, но доступ к организации
    // появится только после одобрения заявки администратором системы.
    joinRequest: joinOrg
      ? { status: 'pending', organization: joinOrg.shortName || joinOrg.name }
      : null,
  });
});

app.get('/api/auth/me', authMiddleware, async (c) => {
  const currentUser = c.get('user');
  const user = await prisma.user.findUnique({ where: { id: currentUser.userId } });
  if (!user || !user.isActive) {
    return c.json({ error: 'Пользователь не найден или деактивирован' }, 401);
  }
  // Какие организации доступны пользователю (для переключателя в интерфейсе)
  const accessibleOrganizations = await getAccessibleOrgs(user.id);
  // Карточка сотрудника, привязанная к учётной записи (для иерархии видимости оборудования на UI)
  const meEmp = await getMyEmployeeInfo(user.id, user.organizationId ?? null);
  const visibleEmployeeIds = meEmp ? await visibleEmployeeIdsFor(meEmp, user.organizationId ?? null) : [];
  return c.json({
    ...publicUser(user),
    accessibleOrganizations,
    employee: meEmp ? { id: meEmp.id, departmentName: meEmp.departmentName, positionName: meEmp.positionName } : null,
    equipmentVisibility: {
      // всё оборудование организации (служебные роли и «Руководство»)
      all: !meEmp ? false
        : (roleExempt(user.role) || LEADERSHIP_DEPT_RE.test(meEmp.departmentName)),
      // id сотрудников, чьё оборудование видно (своё + подчинённые для начальника отдела)
      employeeIds: meEmp && !LEADERSHIP_DEPT_RE.test(meEmp.departmentName) && !roleExempt(user.role)
        ? visibleEmployeeIds : null,
    },
  });
});

// ============================================================
// Мультиорганизационность: создание/смена активной организации
// ============================================================
// GET /api/auth/my-organizations — список организаций, где может работать пользователь
app.get('/api/auth/my-organizations', authMiddleware, async (c) => {
  return c.json(await getAccessibleOrgs(c.get('user').userId));
});

// POST /api/auth/switch-organization — сменить активную организацию и перевыпустить JWT.
// Администратор может переключаться между всеми организациями системы;
// обычный пользователь — только между своими.
app.post('/api/auth/switch-organization', authMiddleware, requireRole(ORG_SWITCH_ROLES), async (c) => {
  const parsed = z.object({ organizationId: z.string().uuid() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);

  const me = c.get('user');
  const target = await prisma.organization.findUnique({ where: { id: parsed.data.organizationId } });
  if (!target) return c.json({ error: 'Организация не найдена' }, 404);

  const accessible = await getAccessibleOrgs(me.userId);
  if (!accessible.some((o) => o.id === target.id)) {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }

  const user = await prisma.user.update({
    where: { id: me.userId },
    data: { organizationId: target.id },
  });

  // Мультиорганизационность: переключение фиксирует членство в новой организации
  // (пользователь теперь состоит и в прежней, и в этой).
  await ensureMemberships(user.id, [user.organizationId]);

  // Перевыпускаем токен с новой организацией — клиент заменит его в localStorage.
  // ВАЖНО: вместе с пользователем возвращаем и accessibleOrganizations — иначе фронт
  // перезапишет currentUser без этого поля, и кнопка «Сменить организацию» в сайдбаре
  // исчезнет до перезагрузки страницы (страница /login тоже отдаёт это поле).
  const token = await issueToken(user);
  const accessibleOrganizations = await getAccessibleOrgs(user.id);
  await writeAudit(me, 'update', 'user', user.id, user.fullName, `Переключение на организацию «${target.name}»`, c.req.header('x-forwarded-for'));

  return c.json({ token, user: { ...publicUser(user), accessibleOrganizations } });
});

// Сохранение выбора темы оформления в БД (light | dark | system)
app.patch('/api/users/me/theme', authMiddleware, async (c) => {
  const currentUser = c.get('user');
  const parsed = z.object({ theme: z.enum(['light', 'dark', 'system']) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }
  const prev = await prisma.user.findUnique({ where: { id: currentUser.userId }, select: { theme: true } });
  const user = await prisma.user.update({
    where: { id: currentUser.userId },
    data: { theme: parsed.data.theme },
  });
  // Тема — отслеживаемое поле: пишем смену в историю (в человекочитаемом виде).
  if (prev && prev.theme !== parsed.data.theme) {
    await applyUpdate({
      ctx: currentUser,
      ipAddress: c.req.header('x-forwarded-for'),
      entityType: 'user',
      entityId: currentUser.userId,
      entityName: user.fullName,
      oldObj: { theme: prev.theme },
      newData: { theme: parsed.data.theme },
    });
  }
  return c.json(publicUser(user));
});

// ============================================================
// Users Routes
// ============================================================
app.get('/api/users', authMiddleware, async (c) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { memberships: { include: { organization: true } } },
  });
  // Столбец «Организация»: активная (из последней сессии) + все организации,
  // в которых состоит пользователь.
  return c.json(await Promise.all(users.map(async (u: any) => ({
    ...publicUser(u),
    organizationName: u.memberships.find((m: any) => m.organizationId === u.organizationId)?.organization?.shortName
      || u.memberships.find((m: any) => m.organizationId === u.organizationId)?.organization?.name
      || null,
    organizations: dedupeOrgs(u).map((o: any) => ({
      id: o.id,
      name: o.name,
      shortName: o.shortName ?? null,
      inn: o.inn ?? '',
      isActive: o.id === u.organizationId,
    })),
  }))));
});

// Членства + активная организация (может существовать без записи членства на
// данных до миграции) — единый список организаций пользователя.
function dedupeOrgs(u: any): any[] {
  const list = u.memberships?.map((m: any) => m.organization).filter(Boolean) ?? [];
  if (u.organizationId && !list.some((o: any) => o.id === u.organizationId)) {
    // не должно случаться (getAccessibleOrgs добавляет), но на всякий случай
    const own = u.memberships?.find((m: any) => m.organizationId === u.organizationId)?.organization;
    if (own) list.push(own);
  }
  const seen = new Set<string>();
  return list.filter((o: any) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}

app.get('/api/users/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  if (currentUser.role !== 'admin' && currentUser.userId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const user = await prisma.user.findUnique({
    where: { id },
    include: { memberships: { include: { organization: true } } },
  });
  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json(await withUserOrgs(user, dedupeOrgs(user)));
});

// ============================================================
// Организации пользователя (мультиорганизационность)
// GET — все организации, в которых состоит пользователь
// PUT — администратор задаёт полный список: добавляет в новые,
//       исключает из удалённых; при переносе в другую организацию
//       активные сессии пользователя инвалидируются (разлогин),
//       и при следующем входе он попадёт в актуальную организацию.
// ============================================================
app.get('/api/users/:id/organizations', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const me = c.get('user');
  if (me.role !== 'admin' && me.userId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const target = await prisma.user.findUnique({
    where: { id },
    include: { memberships: { include: { organization: true } } },
  });
  if (!target) return c.json({ error: 'Not found' }, 404);
  const full = await withUserOrgs(target, dedupeOrgs(target));
  return c.json({ organizationId: full.organizationId, organizationName: full.organizationName, organizations: full.organizations });
});

app.put('/api/users/:id/organizations', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const me = c.get('user');

  const parsed = z
    .object({
      organizationIds: z.array(z.string().uuid()),
      activeOrganizationId: z.string().uuid().nullable().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);

  const target = await prisma.user.findUnique({
    where: { id },
    include: { memberships: { select: { organizationId: true } } },
  });
  if (!target) return c.json({ error: 'Not found' }, 404);

  const requested = [...new Set(parsed.data.organizationIds)];
  // Проверка существования организаций и человекочитаемые названия для истории
  const orgsById = new Map<string, { id: string; name: string; shortName: string | null }>();
  if (requested.length) {
    const found = await prisma.organization.findMany({
      where: { id: { in: requested } },
      select: { id: true, name: true, shortName: true },
    });
    for (const o of found) orgsById.set(o.id, o);
    const missing = requested.filter((oid) => !orgsById.has(oid));
    if (missing.length) return c.json({ error: 'Одна или несколько организаций не найдены' }, 400);
  }

  const existing = target.memberships.map((m) => m.organizationId);
  if (target.organizationId && !existing.includes(target.organizationId)) existing.push(target.organizationId);

  const toAdd = requested.filter((oid) => !existing.includes(oid));
  const toRemove = existing.filter((oid) => !requested.includes(oid));

  // Активная организация: переданная (должна быть в списке), иначе первая из
  // новых, иначе прежняя (если не исключена), иначе null.
  let active: string | null = parsed.data.activeOrganizationId ?? null;
  if (active && !requested.includes(active)) {
    return c.json({ error: 'Активная организация должна входить в список организаций пользователя' }, 400);
  }
  if (!active) {
    if (target.organizationId && requested.includes(target.organizationId)) active = target.organizationId;
    else if (toAdd.length > 0) active = toAdd[0];
    else active = requested[0] ?? null;
  }

  // Перенос в другую организацию (активная сменилась) — принудительный разлогин:
  // инкремент tokenVersion гасит все выданные JWT, при следующем входе пользователь
  // попадёт уже в актуальную организацию.
  const orgChanged = active !== (target.organizationId ?? null);

  await prisma.$transaction([
    ...(toRemove.length ? [prisma.userOrganization.deleteMany({ where: { userId: id, organizationId: { in: toRemove } } })] : []),
    ...(toAdd.length ? [prisma.userOrganization.createMany({ data: toAdd.map((organizationId) => ({ userId: id, organizationId })), skipDuplicates: true })] : []),
    prisma.user.update({ where: { id }, data: { organizationId: active, ...(orgChanged ? { tokenVersion: { increment: 1 } } : {}) } }),
  ]);

  // История изменений: имена организаций (для отображения в карточке/журнале)
  const orgLabel = (oid: string | null) =>
    oid ? (orgsById.get(oid)?.shortName || orgsById.get(oid)?.name || oid) : '—';
  const oldNames = existing.map(orgLabel).join(', ') || '—';
  const newNames = requested.map(orgLabel).join(', ') || '—';
  // Одна запись-заголовок + детализация по полям (тот же формат, что и у
  // applyUpdate): фронтенд группирует по batchId и раскрывает детали по клику.
  {
    const orgItems = [
      { field: 'организации', oldValue: oldNames, newValue: newNames },
      ...(orgChanged ? [{ field: 'активная организация', oldValue: orgLabel(target.organizationId ?? null), newValue: orgLabel(active) }] : []),
    ];
    await writeHistoryBatch('user', id, me.fullName, orgItems);
  }
  await writeAudit(
    me, 'update', 'user', id, target.fullName,
    `Организации пользователя обновлены: ${newNames}${orgChanged ? `; перенос в «${orgLabel(active)}» — сессия сброшена` : ''}`,
    c.req.header('x-forwarded-for'),
  );

  const updated = await prisma.user.findUnique({
    where: { id },
    include: { memberships: { include: { organization: true } } },
  });
  return c.json(await withUserOrgs(updated, dedupeOrgs(updated)));
});

app.get('/api/users/:id/history', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  if (currentUser.role !== 'admin' && currentUser.userId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'user', entityId: id },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/users', authMiddleware, requireRole(['admin']), async (c) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2),
    role: z.enum(ALL_ROLES),
    isActive: z.boolean().optional(),
    organizationId: z.string().uuid().optional().nullable(),
  });

  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }

  const { email, password, fullName, role, isActive, organizationId } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return c.json({ error: 'Пользователь с таким email уже существует' }, 400);
  }

  const currentUser = c.get('user');
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      fullName,
      role,
      isActive: isActive ?? true,
      organizationId: organizationId ?? null,
      updatedById: currentUser.userId,
    },
  });

  await createHistoryEntry('user', user.id, currentUser.fullName);
  await writeAudit(currentUser, 'create', 'user', user.id, fullName, `Создан пользователь "${fullName}" (${role})`, c.req.header('x-forwarded-for'));

  return c.json(publicUser(user), 201);
});

app.put('/api/users/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const isAdmin = currentUser.role === 'admin';

  // Пользователь может редактировать только себя, админ — всех
  if (!isAdmin && currentUser.userId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Некорректные данные' }, 400);
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: 'Not found' }, 404);

  const updateData: any = {};
  let orgChangedByPatch = false; // перенос между организациями → разлогин всех сессий
  if (typeof body.fullName === 'string' && body.fullName.trim().length >= 2) updateData.fullName = body.fullName.trim();
  if (typeof body.email === 'string' && z.string().email().safeParse(body.email).success) {
    if (body.email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email: body.email } });
      if (clash) return c.json({ error: 'Email уже занят' }, 400);
    }
    updateData.email = body.email;
  }
  if (typeof body.avatar === 'string' || body.avatar === null) {
    // data-URL аватара хранится в TEXT-поле. Ограничение ~1.5 МБ base64
    // (256×256 JPEG от AvatarCropper ≈ 10–30 КБ; защита от загрузки оригинала целиком).
    if (body.avatar !== null && body.avatar.length > 2_000_000) {
      return c.json({ error: 'Аватар слишком большой (макс. ~1.5 МБ)' }, 413);
    }
    updateData.avatar = body.avatar === '' ? null : body.avatar;
  }
  if (body.theme !== undefined) {
    const t = z.enum(['light', 'dark', 'system']).safeParse(body.theme);
    if (t.success) updateData.theme = t.data;
  }
  // Привилегированные поля — только для администратора
  if (isAdmin) {
    if (body.role !== undefined) {
      const r = z.enum(ALL_ROLES).safeParse(body.role);
      if (r.success) updateData.role = r.data;
    }
    if (body.isActive !== undefined) {
      updateData.isActive = !!body.isActive;
      // П.4: блокировка моментально отзывает все права — гасим ВСЕ активные
      // сессии пользователя (старые JWT становятся недействительными), а не
      // только после перезагрузки страницы.
      if (!body.isActive && target.isActive) {
        updateData.tokenVersion = (target.tokenVersion ?? 0) + 1;
      }
    }
    if (body.organizationId !== undefined) {
      if (body.organizationId === null) {
        updateData.organizationId = null;
      } else {
        const foundOrg = typeof body.organizationId === 'string'
          ? await prisma.organization.findUnique({ where: { id: body.organizationId }, select: { id: true } })
          : null;
        updateData.organizationId = foundOrg ? foundOrg.id : target.organizationId;
      }
      // Перенос в другую организацию через обычное редактирование пользователя:
      // гасим все активные сессии (разлогин), при следующем входе пользователь
      // попадёт уже в новую актуальную организацию. Членство фиксируем в
      // таблице user_organizations.
      if (updateData.organizationId !== (target.organizationId ?? null)) {
        updateData.tokenVersion = (target.tokenVersion ?? 0) + 1;
        orgChangedByPatch = true;
      }
    }
  }
  if (typeof body.password === 'string' && body.password.length >= 6) {
    updateData.password = await bcrypt.hash(body.password, 12);
  }

  if (Object.keys(updateData).length === 0) {
    return c.json(publicUser(target));
  }

  updateData.updatedById = currentUser.userId;
  const user = await prisma.user.update({ where: { id }, data: updateData });

  // Перенесли в другую организацию — фиксируем членство в новой (мультиорганизационность)
  if (orgChangedByPatch) {
    await ensureMemberships(user.id, [user.organizationId]);
  }

  // История: без значения пароля. В diff не включаем служебные поля БД
  // (updatedById добавляется ниже) — иначе historyRecord.create падает с
  // неизвестным полем и клиент получал «Внутренняя ошибка сервера», хотя
  // изменения уже были сохранены (повторный клик давал «Роль уже назначена»).
  const safeOld: Record<string, any> = { ...target };
  delete safeOld.password;
  const safeNew: Record<string, any> = { ...updateData };
  delete safeNew.updatedById;
  // Смена пароля учитывается в той же группе изменений, что и остальные поля
  // (общий batchId), чтобы в истории обновление было одной записью.
  let passwordChanged = false;
  if ('password' in safeNew) {
    delete safeNew.password;
    passwordChanged = true;
  }
  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'user',
    entityId: id,
    entityName: user.fullName,
    oldObj: safeOld,
    newData: safeNew,
    extraChanges: passwordChanged
      ? [{ field: 'пароль', oldValue: '—', newValue: 'изменён', summary: 'пароль: изменён (значение не сохраняется)' }]
      : undefined,
  });

  // п.2: аватар пользователя — источник истины; при изменении/смене e-mail
  // пересинхронизируем привязанного сотрудника (включая автопривязку по новому e-mail)
  if ('avatar' in updateData || 'email' in updateData) {
    const linked = await prisma.employee.findFirst({ where: { OR: [{ userId: id }, (updateData.email ? { email: updateData.email as string } : { id: '__none__' })] } });
    if (linked) await syncEmployeeUserLink(linked.id);
  }

  return c.json(publicUser(user));
});

app.delete('/api/users/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  if (currentUser.userId === id) {
    return c.json({ error: 'Нельзя удалить собственную учётную запись' }, 400);
  }
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return c.json({ error: 'Not found' }, 404);

  await prisma.historyRecord.deleteMany({ where: { entityType: 'user', entityId: id } });
  await prisma.user.delete({ where: { id } });
  await writeAudit(currentUser, 'delete', 'user', id, target.fullName, `Удалён пользователь "${target.fullName}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// ============================================================
// Organizations Routes
// ============================================================
// Свободные текстовые поля организации (ОПФ вводится вручную, главный бухгалтер упразднён)
const orgText = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null),
  z.string().max(500).nullable().optional(),
);

const organizationSchema = z.object({
  name: z.string().min(2),
  legalForm: orgText,          // ОПФ — произвольный текст (вводится руками)
  shortName: orgText,
  inn: z.string().min(4),
  kpp: orgText,
  ogrn: z.string().min(4),
  legalAddress: z.string().min(5),   // юридический адрес обязателен
  postalCode: z.string().regex(/^\d{6}$/, 'Почтовый индекс — 6 цифр'),
  actualAddress: orgText,
  city: orgText,
  phone: orgText,
  email: z.string().email().nullable().optional().or(z.literal('')),
  website: orgText,
  directorName: orgText,
  accountantName: orgText,     // устаревшее поле (главный бухгалтер берётся из штатного расписания)
  bankName: orgText,
  checkingAccount: orgText,
  correspondentAccount: orgText,
  bik: orgText,
  taxSystem: orgText,
  industry: orgText,
  employeeCount: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.number().int().nullable().optional()),
  foundedDate: orgText,
  logo: z.string().nullable().optional(),
  notes: orgText,
});

function publicOrganization(o: any) {
  return {
    ...o,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    createdBy: o.createdById,
    updatedBy: o.updatedById,
  };
}

app.get('/api/organizations', authMiddleware, async (c) => {
  const organizations = await prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
  return c.json(organizations.map(publicOrganization));
});

// Публичный краткий список организаций — используется ТОЛЬКО на форме
// регистрации для выбора «Присоединиться к существующей организации».
// Отдаём исключительно id + краткое наименование: реквизиты (ИНН, адрес и
// т.п.) не раскрываются неаутентифицированному посетителю. Полные данные —
// через GET /api/organizations (authMiddleware).
app.get('/api/public/organizations', async (c) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, shortName: true, name: true },
  });
  return c.json(orgs.map((o) => ({ id: o.id, shortName: o.shortName || o.name })));
});

app.get('/api/organizations/:id', authMiddleware, async (c) => {
  const org = await prisma.organization.findUnique({ where: { id: c.req.param('id') } });
  if (!org) return c.json({ error: 'Not found' }, 404);
  return c.json(publicOrganization(org));
});

app.get('/api/organizations/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'organization', entityId: c.req.param('id') },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/organizations', authMiddleware, requireRole(ORG_CREATE_ROLES), async (c) => {
  const parsed = organizationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные организации' }, 400);
  }
  const currentUser = c.get('user');

  // Мультиорганизационность: разрешено создавать несколько организаций.
  // Защита от дубликата ИНН в системе.
  const innDup = await prisma.organization.findFirst({ where: { inn: parsed.data.inn } });
  if (innDup) {
    return c.json({ error: `Организация с ИНН «${parsed.data.inn}» уже существует` }, 409);
  }

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      legalForm: parsed.data.legalForm ?? null,
      shortName: parsed.data.shortName ?? parsed.data.name,
      inn: parsed.data.inn,
      ogrn: parsed.data.ogrn,
      legalAddress: parsed.data.legalAddress ?? null,
      kpp: parsed.data.kpp ?? null,
      actualAddress: parsed.data.actualAddress ?? null,
      postalCode: parsed.data.postalCode ?? null,
      city: parsed.data.city ?? null,
      phone: parsed.data.phone ?? null,
      email: typeof parsed.data.email === 'string' && parsed.data.email ? parsed.data.email : null,
      website: parsed.data.website ?? null,
      directorName: parsed.data.directorName ?? null,
      accountantName: parsed.data.accountantName ?? null,
      bankName: parsed.data.bankName ?? null,
      checkingAccount: parsed.data.checkingAccount ?? null,
      correspondentAccount: parsed.data.correspondentAccount ?? null,
      bik: parsed.data.bik ?? null,
      taxSystem: parsed.data.taxSystem ?? null,
      industry: parsed.data.industry ?? null,
      employeeCount: parsed.data.employeeCount ?? null,
      foundedDate: parsed.data.foundedDate ?? null,
      logo: parsed.data.logo ?? null,
      notes: parsed.data.notes ?? null,
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    },
  });

  await createHistoryEntry('organization', org.id, currentUser.fullName);
  await writeAudit(currentUser, 'create', 'organization', org.id, org.name, `Создана организация "${org.name}"`, c.req.header('x-forwarded-for'));

  // Создавший переключается на новую организацию.
  // ВАЖНО: пользователи без организации привязываются к ней только если это
  // ПЕРВАЯ организация в системе (первичная инициализация). Иначе создание
  // второй организации сбрасывало бы активную организацию у всех пользователей.
  const orgCount = await prisma.organization.count();
  if (orgCount <= 1) {
    await prisma.user.updateMany({ where: { organizationId: null }, data: { organizationId: org.id } });
    // «Мягкая миграция»: всем пользователям без членств фиксируем эту организацию
    await prisma.userOrganization.createMany({
      data: (await prisma.user.findMany({ select: { id: true } })).map((u) => ({ userId: u.id, organizationId: org.id })),
      skipDuplicates: true,
    }).catch(() => {});
  }
  await prisma.user.update({ where: { id: currentUser.userId }, data: { organizationId: org.id } });
  // Создавший становится участником новой организации
  await ensureMemberships(currentUser.userId, [org.id]);

  const updatedMe = await prisma.user.findUnique({ where: { id: currentUser.userId } });
  const token = await issueToken(updatedMe);

  // Клиенту возвращаем полный список доступных организаций — иначе после создания
  // второй организации переключатель «запоминал» только первую.
  const accessibleOrganizations = await getAccessibleOrgs(currentUser.userId);

  return c.json({ ...publicOrganization(org), token, user: { ...publicUser(updatedMe), accessibleOrganizations } }, 201);
});

app.put('/api/organizations/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const parsed = organizationSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }
  const currentUser = c.get('user');

  const oldOrg = await prisma.organization.findUnique({ where: { id } });
  if (!oldOrg) return c.json({ error: 'Not found' }, 404);

  const newData: any = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) newData[k] = v;
  }
  newData.updatedById = currentUser.userId;

  const org = await prisma.organization.update({ where: { id }, data: newData });

  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'organization',
    entityId: id,
    entityName: org.name,
    oldObj: oldOrg as any,
    newData,
  });

  return c.json(publicOrganization(org));
});

app.delete('/api/organizations/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) return c.json({ error: 'Not found' }, 404);

  // Удаление организации со ВСЕМИ её данными (каскад подтверждается пользователем в UI).
  // Порядок важен из-за FK-связей: сетевые интерфейсы и сервисы удаляются вместе с ВМ
  // (onDelete: Cascade), истории передач — вместе с оборудованием.
  await prisma.$transaction(async (tx) => {
    const equipmentIds = (await tx.equipment.findMany({ where: { organizationId: id }, select: { id: true } })).map((e) => e.id);
    const vmIds = (await tx.virtualMachine.findMany({ where: { organizationId: id }, select: { id: true } })).map((v) => v.id);
    const employeeIds = (await tx.employee.findMany({ where: { organizationId: id }, select: { id: true } })).map((e) => e.id);
    const entityIds = [...equipmentIds, ...vmIds, ...employeeIds];

    // Справочники штатного расписания (FK сотрудников/оборудования снимаются ниже)
    await tx.department.deleteMany({ where: { organizationId: id } });
    await tx.position.deleteMany({ where: { organizationId: id } });
    await tx.branch.deleteMany({ where: { organizationId: id } });

    // Основные данные организации
    await tx.employee.deleteMany({ where: { organizationId: id } });
    await tx.equipment.deleteMany({ where: { organizationId: id } });
    await tx.virtualMachine.deleteMany({ where: { organizationId: id } });

    // История изменений объектов организации
    if (entityIds.length > 0) {
      await tx.historyRecord.deleteMany({ where: { entityId: { in: entityIds } } });
    }

    // Отвязываем пользователей, привязанных к этой организации
    await tx.user.updateMany({ where: { organizationId: id }, data: { organizationId: null } });

    // Карточка организации
    await tx.historyRecord.deleteMany({ where: { entityType: 'organization', entityId: id } });
    await tx.organization.delete({ where: { id } });
  });

  // Если удалили активную организацию — перевыпускаем JWT: на другую доступную
  // организацию пользователя либо без организации (UI отправит на создание).
  let token: string | null = null;
  let user: any = null;
  if (currentUser.organizationId === id) {
    const me = await prisma.user.findUnique({ where: { id: currentUser.userId } });
    if (me) {
      const accessible = await getAccessibleOrgs(me.id);
      if (accessible.length > 0) {
        const updated = await prisma.user.update({ where: { id: me.id }, data: { organizationId: accessible[0].id } });
        token = await issueToken(updated);
        user = publicUser(updated);
      } else {
        token = await issueToken(me);
        user = publicUser(me);
      }
    }
  }

  await writeAudit(currentUser, 'delete', 'organization', id, org.name, `Удалена организация "${org.name}" (со всеми данными)`, c.req.header('x-forwarded-for'));
  return c.json({ success: true, ...(token && user ? { token, user } : {}) });
});

// ============================================================
// Employees Routes
// ============================================================
const employeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional().nullable(),
  positionId: z.string().min(1),
  departmentId: z.string().min(1),
  // Филиал необязателен (создавать филиалы не обязательно — сотрудник может быть без филиала)
  branchId: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().uuid().nullable().optional()),
  email: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().email().nullable().optional()),
  workPhone: z.string().optional().nullable(),
  internalPhone: z.string().optional().nullable(),
  personalPhone: z.string().optional().nullable(),
  hireDate: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? new Date() : v),
    z.coerce.date(),
  ),
  birthDate: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? null : v),
    z.coerce.date().nullable().optional(),
  ),
  userId: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().uuid().nullable().optional()),
  // Организация сотрудника — администратор и специалист по кадрам могут
  // привязать карточку к любой организации через редактирование.
  organizationId: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().uuid().nullable().optional()),
  isEmployed: z.boolean().optional(),
  floor: z.string().optional().nullable(),
  room: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Приводит записи к клиентскому формату: даты в ISO, связанные сущности — краткие объекты
function briefEmp(e: any) {
  if (!e) return null;
  return { id: e.id, firstName: e.firstName, lastName: e.lastName, middleName: e.middleName };
}
function publicEmployee(e: any): any {
  return {
    ...e,
    hireDate: isoDate(e.hireDate),
    birthDate: e.birthDate ? isoDate(e.birthDate) : null,
    avatar: e.avatar ?? null,
    userId: e.userId ?? null,
    createdAt: isoDate(e.createdAt),
    updatedAt: isoDate(e.updatedAt),
    position: e.position ? { id: e.position.id, name: e.position.name } : undefined,
    department: e.department ? { id: e.department.id, name: e.department.name } : undefined,
    branch: e.branch ? { id: e.branch.id, name: e.branch.name } : undefined,
    // Организация карточки сотрудника (для формы редактирования и отображения)
    organizationId: e.organizationId ?? null,
    organization: e.organization ? { id: e.organization.id, name: e.organization.name, shortName: e.organization.shortName ?? null } : undefined,
    equipment: Array.isArray(e.equipment) ? e.equipment.map(publicEquipmentBrief) : undefined,
  };
}
function publicEquipmentBrief(eq: any): any {
  if (!eq) return eq;
  const out: any = { ...eq };
  if (out.purchaseDate !== undefined) out.purchaseDate = out.purchaseDate ? isoDate(out.purchaseDate) : null;
  if (out.writeOffDate !== undefined) out.writeOffDate = out.writeOffDate ? isoDate(out.writeOffDate) : null;
  out.createdAt = isoDate(out.createdAt);
  out.updatedAt = isoDate(out.updatedAt);
  if ('assignedToEmployee' in out) out.assignedToEmployee = briefEmp(out.assignedToEmployee);
  // МОЛ — материально ответственное лицо, на подотчёте которого числится оборудование
  if ('materiallyResponsibleEmployee' in out) out.materiallyResponsibleEmployee = briefEmp(out.materiallyResponsibleEmployee);
  if ('branch' in out && out.branch) out.branch = { id: out.branch.id, name: out.branch.name };
  if ('dataCenter' in out && out.dataCenter) out.dataCenter = { id: out.dataCenter.id, name: out.dataCenter.name };
  delete out.assignedToEmployeeIdRaw;
  return out;
}
function publicVM(vm: any): any {
  return {
    ...vm,
    createdAt: isoDate(vm.createdAt),
    updatedAt: isoDate(vm.updatedAt),
    hostServer: vm.hostServer ? publicEquipmentBrief(vm.hostServer) : (vm.hostServer === null ? null : vm.hostServer),
    responsibleEmployee: briefEmp(vm.responsibleEmployee),
    serviceResponsibleEmployee: briefEmp(vm.serviceResponsibleEmployee),
    materiallyResponsibleEmployee: briefEmp(vm.materiallyResponsibleEmployee),
    networkInterfaces: (vm.networkInterfaces || []).map((ni: any) => ({ ...ni, createdAt: isoDate(ni.createdAt), updatedAt: isoDate(ni.updatedAt) })),
    services: (vm.services || []).map((sv: any) => ({ ...sv, createdAt: isoDate(sv.createdAt), updatedAt: isoDate(sv.updatedAt) })),
  };
}

const employeeInclude = { position: true, department: true, branch: true, equipment: true, organization: { select: { id: true, name: true, shortName: true } }, linkedUser: { select: { id: true, fullName: true, email: true } } } as const;

// Столбец «Организация» в списке сотрудников: приоритет — организация, к которой
// привязана карточка сотрудника (employee.organizationId); если карточка без
// организации и есть учётная запись — актуальная организация из её последней сессии.
async function attachEmployeeOrgs(list: any[]) {
  const userIds = [...new Set(list.map((e: any) => e.userId).filter(Boolean))] as string[];
  const byUser = new Map<string, { organizationId: string | null; organizationName: string | null }>();
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, organizationId: true,
        memberships: { include: { organization: { select: { name: true, shortName: true } } } },
      },
    });
    for (const u of users as any[]) {
      const m = u.memberships?.find((x: any) => x.organizationId === u.organizationId)?.organization;
      byUser.set(u.id, {
        organizationId: u.organizationId ?? null,
        organizationName: m ? (m.shortName || m.name) : null,
      });
    }
  }
  return list.map((e: any) => {
    const own = e.organization ? { organizationId: e.organization.id, organizationName: e.organization.shortName || e.organization.name } : null;
    const fromUser = e.userId ? (byUser.get(e.userId) ?? null) : null;
    return { ...e, userOrganization: own ?? fromUser };
  });
}

app.get('/api/employees', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const where: any = {};
  if (scope.orgId) where.organizationId = scope.orgId; else where.organizationId = null;
  const employees = await prisma.employee.findMany({ where, include: employeeInclude, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  return c.json(await attachEmployeeOrgs(employees.map(publicEmployee)));
});

app.get('/api/employees/:id', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const employee = await prisma.employee.findUnique({ where: { id: c.req.param('id') }, include: employeeInclude });
  if (!employee) return c.json({ error: 'Not found' }, 404);
  // Мультиорганизационность: чужую организацию не показываем (админу — все)
  if (employee.organizationId && employee.organizationId !== scope.orgId && scope.role !== 'admin') {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }
  // Карточка сотрудника: все организации привязанной учётной записи
  // (активная — где пользователь был в последний раз)
  const [enriched] = await attachEmployeeOrgs([publicEmployee(employee)]);
  if (employee.userId) {
    const acc = await prisma.user.findUnique({
      where: { id: employee.userId },
      include: { memberships: { include: { organization: true } } },
    });
    if (acc) {
      const full = await withUserOrgs(acc, dedupeOrgs(acc));
      (enriched as any).userOrganizations = full.organizations;
    }
  }
  return c.json(enriched);
});

app.get('/api/employees/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'employee', entityId: c.req.param('id') },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(history.map(publicHistory));
});

async function syncEmployeeUserLink(employeeId: string): Promise<void> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return;
  let userId: string | null = emp.userId ?? null;
  // привязка сохранена, но пользователь исчез — чистим висячую ссылку
  if (userId && !(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
    userId = null;
    await prisma.employee.update({ where: { id: emp.id }, data: { userId: null } }).catch(() => {});
  }
  if (!userId && emp.email) {
    const user = await prisma.user.findFirst({ where: { email: emp.email } });
    if (user) {
      const taken = await prisma.employee.findFirst({ where: { userId: user.id, id: { not: emp.id } } });
      if (!taken) {
        userId = user.id;
        await prisma.employee.update({ where: { id: emp.id }, data: { userId: user.id } });
      }
    }
  }
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } });
    if (user && (emp.avatar ?? null) !== (user.avatar ?? null)) {
      await prisma.employee.update({ where: { id: emp.id }, data: { avatar: user.avatar ?? null } });
    }
  }
}

app.post('/api/employees', authMiddleware, requireRole(EMPLOYEE_MANAGE_ROLES), async (c) => {
  const parsed = employeeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные сотрудника' }, 400);
  }
  const currentUser = c.get('user');
  const data = parsed.data;
  const scope = await getUserOrgScope(currentUser.userId);

  // Организация сотрудника: admin/hr_specialist могут явно указать любую
  // существующую организацию; по умолчанию — активная организация автора.
  let targetOrgId: string | null = scope.orgId;
  if (data.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } });
    if (!org) return c.json({ error: 'Выбранная организация не найдена' }, 400);
    targetOrgId = org.id;
  }

  // Справочники должны принадлежать целевой организации (или быть общими)
  const positionId = await resolveRef('position', data.positionId, targetOrgId);
  const departmentId = await resolveRef('department', data.departmentId, targetOrgId);
  // Филиал необязателен: пустое/некорректное значение => null (сотрудник без филиала)
  const branchId = await resolveRefOrNull('branch', data.branchId ?? undefined, targetOrgId) ?? null;
  if (!positionId || !departmentId) {
    return c.json({ error: 'Справочники (должность/отдел) выбраны некорректно для выбранной организации' }, 400);
  }

  const employee = await prisma.employee.create({
    data: {
      organizationId: targetOrgId,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName ?? null,
      email: data.email ?? null,
      workPhone: data.workPhone ?? null,
      internalPhone: data.internalPhone ?? null,
      personalPhone: data.personalPhone ?? null,
      hireDate: data.hireDate,
      birthDate: data.birthDate ?? null,
      userId: data.userId ?? null,
      isEmployed: data.isEmployed ?? true,
      floor: data.floor ?? null,
      room: data.room ?? null,
      notes: data.notes ?? null,
      positionId,
      departmentId,
      branchId,
      updatedById: currentUser.userId,
    },
    include: employeeInclude,
  });

  const name = `${employee.lastName} ${employee.firstName} ${employee.middleName || ''}`.trim();
  await createHistoryEntry('employee', employee.id, currentUser.fullName);
  await writeAudit(currentUser, 'create', 'employee', employee.id, name, `Создан сотрудник "${name}"`, c.req.header('x-forwarded-for'));

  // п.1: автопривязка к пользователю по e-mail + автосинхронизация аватара (п.2)
  await syncEmployeeUserLink(employee.id);

  return c.json(publicEmployee(await prisma.employee.findUnique({ where: { id: employee.id }, include: employeeInclude })), 201);
});

app.put('/api/employees/:id', authMiddleware, requireRole(EMPLOYEE_MANAGE_ROLES), async (c) => {
  const { id } = c.req.param();
  const parsed = employeeSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }
  const currentUser = c.get('user');

  const old = await prisma.employee.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  const scope = await getUserOrgScope(currentUser.userId);
  if (old.organizationId && old.organizationId !== scope.orgId && scope.role !== 'admin') {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }

  const newData: any = { ...parsed.data };
  if (newData.hireDate && !(newData.hireDate instanceof Date)) newData.hireDate = new Date(newData.hireDate);
  if ('birthDate' in newData && newData.birthDate && !(newData.birthDate instanceof Date)) newData.birthDate = new Date(newData.birthDate);
  // п. привязка сотрудника к организации (admin / hr_specialist):
  // проверяем существование; справочники подбираем под целевую организацию.
  let targetOrgId: string | null = old.organizationId ?? scope.orgId;
  if ('organizationId' in newData) {
    if (newData.organizationId) {
      const org = await prisma.organization.findUnique({ where: { id: newData.organizationId }, select: { id: true } });
      if (!org) return c.json({ error: 'Выбранная организация не найдена' }, 400);
      targetOrgId = org.id;
      newData.organizationId = org.id;
    } else {
      // Явно выбрано «Без организации» — отвязываем карточку от организации
      targetOrgId = null;
      newData.organizationId = null;
    }
  } else {
    delete newData.organizationId;
  }
  // п.1: проверка привязки пользователя (нельзя занять чужую; несуществующий => null)
  if ('userId' in newData && newData.userId) {
    const targetUser = await prisma.user.findUnique({ where: { id: newData.userId }, select: { id: true } });
    if (!targetUser) return c.json({ error: 'Выбранный пользователь не найден' }, 400);
    const takenBy = await prisma.employee.findFirst({ where: { userId: newData.userId, id: { not: id } }, select: { id: true, lastName: true, firstName: true } });
    if (takenBy) return c.json({ error: `Этот пользователь уже привязан к сотруднику ${takenBy.lastName} ${takenBy.firstName}` }, 400);
  }
  if ('positionId' in newData) newData.positionId = await resolveRef('position', newData.positionId, targetOrgId) ?? old.positionId;
  if ('departmentId' in newData) newData.departmentId = await resolveRef('department', newData.departmentId, targetOrgId) ?? old.departmentId;
  if ('branchId' in newData) newData.branchId = await resolveRefOrNull('branch', newData.branchId ?? undefined, targetOrgId) ?? null;
  newData.updatedById = currentUser.userId;

  const employee = await prisma.employee.update({ where: { id }, data: newData, include: employeeInclude });

  // п.1/п.2: автопривязка по e-mail и синхронизация аватара сотрудника с пользователем
  await syncEmployeeUserLink(id);

  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'employee',
    entityId: id,
    entityName: `${employee.lastName} ${employee.firstName}`,
    oldObj: old as any,
    newData,
  });

  return c.json(publicEmployee(employee));
});

app.delete('/api/employees/:id', authMiddleware, requireRole(EMPLOYEE_MANAGE_ROLES), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.employee.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);
  const scope = await getUserOrgScope(currentUser.userId);
  if (old.organizationId && old.organizationId !== scope.orgId && scope.role !== 'admin') {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }

  await prisma.employee.delete({ where: { id } });
  await writeAudit(currentUser, 'delete', 'employee', id, `${old.lastName} ${old.firstName}`, `Удалён сотрудник "${old.lastName} ${old.firstName}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// ============================================================
// Equipment Routes
// ============================================================
// Косяк 5: пустые строки и строковые "null"/"undefined" из форм превращаем в null,
// иначе zod отклоняет весь объект с невнятной ошибкой «Некорректные данные».
const emptyToNull = (v: any) => {
  if (typeof v === 'string' && (v.trim() === '' || v === 'null' || v === 'undefined')) return null;
  return v;
};
const numOrEmpty = (schema: any) =>
  z.preprocess((v) => (emptyToNull(v) === null ? undefined : v), schema.optional().nullable());
const strOrEmpty = (schema: any) =>
  z.preprocess(emptyToNull, schema.optional().nullable());

// Кластер виртуализации — логическая сущность: у него нет физической инвентарной
// карточки (серийного/инвентарного номера), поэтому для этой роли они необязательны.
const CLUSTER_ROLE = 'cluster';
const equipmentSchema = z.object({
  name: z.string().min(1, 'Укажите наименование'),
  category: z.enum(['computer', 'monitor', 'peripheral', 'furniture', 'server', 'storage', 'virtual_machine', 'network', 'phone', 'other']),
  serialNumber: strOrEmpty(z.string()),
  inventoryNumber: strOrEmpty(z.string()),
  brand: strOrEmpty(z.string()),
  model: strOrEmpty(z.string()),
  purchaseDate: z.preprocess((v) => (emptyToNull(v) === null ? undefined : v), z.coerce.date().optional().nullable()),
  writeOffDate: z.preprocess((v) => (emptyToNull(v) === null ? undefined : v), z.coerce.date().optional().nullable()),
  condition: z.enum(['new', 'good', 'satisfactory', 'needs_repair', 'written_off']).optional(),
  assignedToEmployeeId: strOrEmpty(z.string()),
  // МОЛ (материально ответственное лицо) — сотрудник, на подотчёте которого
  // числится это оборудование
  materiallyResponsibleEmployeeId: strOrEmpty(z.string()),
  // Место размещения: филиал (branchId) или ЦОД (dataCenterId).
  // Для физической техники обязателен филиал; для кластеров допустим ЦОД
  // (арендованные/облачные мощности) — проверка «ровно одного из двух» ниже по serverRole.
  branchId: strOrEmpty(z.string()),
  dataCenterId: strOrEmpty(z.string()),
  locationType: strOrEmpty(z.enum(['branch', 'data_center'])),
  floor: strOrEmpty(z.string()),
  room: strOrEmpty(z.string()),
  serverRole: z.enum(['hypervisor_host', 'storage', 'management_console', 'standalone', 'cluster']).optional().nullable(),
  hypervisorName: strOrEmpty(z.string()),
  clusterName: strOrEmpty(z.string()),
  hypervisorVersion: strOrEmpty(z.string()),
  storageType: z.enum(['san', 'nas', 'hci']).optional().nullable(),
  storageProtocol: z.enum(['iscsi', 'fc', 'fcoe', 'nfs', 'smb', 'sas', 'nvmeof', 'vsan', 'ceph']).optional().nullable(),
  // Объёмы хранятся в ГБ; дробные значения (ввод через запятую) допускаются
  storageCapacityGB: numOrEmpty(z.number().min(0)),
  cpuCores: numOrEmpty(z.number().int().min(0)),
  ramGB: numOrEmpty(z.number().min(0)),
  diskGB: numOrEmpty(z.number().min(0)),
  /** Кластер-сервер, внутрь которого помещается этот сервер/СХД (косяк 11) */
  parentClusterId: strOrEmpty(z.string()),
  notes: strOrEmpty(z.string()),
});

const equipmentInclude = { assignedToEmployee: true, materiallyResponsibleEmployee: true, branch: true, dataCenter: true } as const;

// ============================================================
// Серверы виртуализации: роли, кластеры и проверки целостности
// ============================================================
const VIRT_ROLES = ['hypervisor_host', 'storage', 'management_console', 'cluster'];

/** Жёсткой привязки ВМ к гипервизору нет: ВМ может жить на любом сервере —
 *  хосте кластера, автономном сервере без роли («как обычный компьютер, на
 *  котором подняли пару виртуалок»). Запрещены только заведомо неподходящие
 *  сущности: сам кластер (логическая сущность), СХД и консоль управления. */
async function assertVmHostIsHypervisor(hostServerId: string | null | undefined): Promise<string | null> {
  if (!hostServerId) return hostServerId ?? null;
  const host = await prisma.equipment.findUnique({ where: { id: hostServerId }, select: { serverRole: true, category: true, name: true } });
  if (!host) {
    throw new VmHostError('Выбранный хост-сервер не найден (возможно, удалён). Обновите страницу и выберите существующий хост.');
  }
  // Явно запрещённые роли: кластер, СХД, консоль управления
  if (host.serverRole === 'cluster') {
    throw new VmHostError(`«${host.name}» — это кластер виртуализации, а не физический хост. ВМ размещаются на конкретных хостах, а принадлежность к кластеру определяется автоматически по хосту.`);
  }
  if (host.serverRole === 'storage') {
    throw new VmHostError(`«${host.name}» — СХД (система хранения), на ней нельзя разместить ВМ. Выберите сервер-хост.`);
  }
  if (host.serverRole === 'management_console') {
    throw new VmHostError(`«${host.name}» — консоль управления гипервизором, а не хост размещения. ВМ нельзя разместить на консоли — выберите сервер-хост.`);
  }
  // Оборудование не-серверного типа тоже не может быть хостом
  if (host.category !== 'server') {
    throw new VmHostError(`«${host.name}» не является сервером и не может быть хостом для ВМ. Выберите физический сервер.`);
  }
  return hostServerId;
}
class VmHostError extends Error {}

/** Кластер (serverRole === 'cluster') не может быть сам помещён внутрь другого кластера. */
async function validateParentCluster(id: string | null | undefined, selfId?: string): Promise<string | null> {
  if (!id || id.trim() === '') return null;
  if (selfId && id === selfId) throw new VmHostError('Кластер не может включать сам себя.');
  const pc = await prisma.equipment.findUnique({ where: { id }, select: { serverRole: true, parentClusterId: true } });
  if (!pc) return null;
  if (pc.serverRole !== 'cluster') throw new VmHostError('Родительский кластер должен иметь роль «Кластер виртуализации».');
  if (pc.parentClusterId) throw new VmHostError('Вложенность кластеров не поддерживается: выбранный кластер сам входит в другой кластер.');
  if (selfId) {
    const child = await prisma.equipment.findUnique({ where: { id }, select: { parentClusterId: true } });
    if (child && child.parentClusterId === selfId) throw new VmHostError('Нельзя поместить кластер внутрь его же члена — циклическая вложенность.');
  }
  return id;
}

function normalizeDateField(v: any) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return v instanceof Date ? v : new Date(v);
}

/** Состав кластера из ClusterForm (__members): выбранные хосты/СХД/консоли
 *  управления получают parentClusterId, снятые участники — отвязываются.
 *  Применяется после создания/обновления кластера в одной транзакции. */
async function applyClusterMembers(clusterId: string, orgId: string | null, membersRaw: unknown) {
  const memberIds = Array.from(new Set(Array.isArray(membersRaw) ? membersRaw.filter((x): x is string => typeof x === 'string' && !!x) : []));
  // В выборку попадают только единицы оборудования той же организации с «кластерной» ролью
  await prisma.$transaction(async (tx) => {
    if (memberIds.length > 0) {
      const valid = await tx.equipment.findMany({
        where: { id: { in: memberIds }, organizationId: orgId, serverRole: { in: ['hypervisor_host', 'storage', 'management_console'] } },
        select: { id: true, parentClusterId: true },
      });
      // Привязываем только свободные железо и текущих участников этого кластера.
      // Единицы из ДРУГОГО кластера не перетягиваем молча — иначе состав чужого
      // кластера изменился бы без ведома его владельца («перехват» железа).
      const transferableIds = valid.filter((v) => !v.parentClusterId || v.parentClusterId === clusterId).map((v) => v.id);
      const skipped = valid.length - transferableIds.length;
      if (transferableIds.length > 0) {
        await tx.equipment.updateMany({ where: { id: { in: transferableIds } }, data: { parentClusterId: clusterId } });
      }
      if (skipped > 0) {
        throw new VmHostError(`Некоторые выбранные единицы уже состоят в другом кластере — освободите их в карточке того кластера (или через форму другого кластера), затем повторите сохранение.`);
      }
    }
    // Бывшие участники, которые были сняты галочкой в форме, отвязываются от кластера
    await tx.equipment.updateMany({
      where: { parentClusterId: clusterId, ...(memberIds.length > 0 ? { id: { notIn: memberIds } } : {}) },
      data: { parentClusterId: null },
    });
  });
}

app.get('/api/equipment', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const where: any = {};
  if (scope.orgId) where.organizationId = scope.orgId; else where.organizationId = null;
  // Иерархия видимости: обычный сотрудник — только своё закреплённое оборудование,
  // начальник отдела — всё оборудование отдела, «Руководство» — всё оборудование организации.
  const vis = await equipmentVisibilityWhere(c.get('user').userId, scope.role, scope.orgId);
  if (vis) Object.assign(where, vis);
  // Фильтр по МОЛ (?molEmployeeId=<id>): материально ответственные лица могут
  // отобрать в общем списке только подотчётное им оборудование. Значение
  // 'me' — текущий сотрудник (для ролей без карточек other-фильтрация не применяется).
  const molParam = c.req.query('molEmployeeId');
  if (molParam) {
    let molId = molParam === 'me' ? null : molParam;
    if (molParam === 'me') {
      const meEmp = await getMyEmployeeInfo(c.get('user').userId, scope.orgId);
      molId = meEmp?.id ?? null;
    }
    if (molId) where.materiallyResponsibleEmployeeId = molId;
  }
  const items = await prisma.equipment.findMany({ where, include: equipmentInclude, orderBy: { createdAt: 'desc' } });
  return c.json(items.map(publicEquipmentBrief));
});

app.get('/api/equipment/:id', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const item = await prisma.equipment.findUnique({ where: { id: c.req.param('id') }, include: equipmentInclude });
  if (!item) return c.json({ error: 'Not found' }, 404);
  if (item.organizationId && item.organizationId !== scope.orgId && scope.role !== 'admin') {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }
  // Иерархия видимости: карточка доступна только тем, кто видит единицу в списке
  const vis = await equipmentVisibilityWhere(c.get('user').userId, scope.role, scope.orgId);
  if (vis) {
    const ids = (vis as any).OR[0].assignedToEmployeeId.in as string[];
    const linked = (item.assignedToEmployeeId && ids.includes(item.assignedToEmployeeId))
      || (item.materiallyResponsibleEmployeeId && ids.includes(item.materiallyResponsibleEmployeeId));
    if (!linked) return c.json({ error: 'Оборудование не закреплено за вами или вашим отделом' }, 403);
  }
  return c.json(publicEquipmentBrief(item));
});

app.get('/api/equipment/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'equipment', entityId: c.req.param('id') },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(history.map(publicHistory));
});

// Создание оборудования: admin + sysadmin (инфраструктурная техника).
// Специалист по кадрам новых карточек не создаёт (EQUIPMENT_CREATE_ROLES).
app.post('/api/equipment', authMiddleware, requireRole([...EQUIPMENT_CREATE_ROLES, 'sysadmin']), async (c) => {
  const body = await c.req.json().catch(() => null);
  // ClusterForm передаёт состав кластера служебным полем __members — извлекаем его
  // до валидации схемы (в equipmentSchema его нет).
  const requestedMembers = Array.isArray(body?.__members) ? body.__members : null;
  if (body && '__members' in body) delete body.__members;
  const parsed = equipmentSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return c.json({ error: first?.message && first.message !== 'Invalid input' ? `Некорректные данные оборудования: ${first.message}` : 'Некорректные данные оборудования' }, 400);
  }
  const currentUser = c.get('user');
  const data = parsed.data;
  const scope = await getUserOrgScope(currentUser.userId);

  // sysadmin может заводить карточки инфраструктурной техники (серверы/кластеры/СХД),
  // уточняя данные у МОЛ; офисное оборудование (serverRole не задан) ему недоступно.
  if (!EQUIPMENT_CREATE_ROLES.includes(roleOf(c)) && !isInfraEquipment(data.serverRole)) {
    return c.json({ error: 'Недостаточно прав: системному администратору доступно только создание серверов и кластеров' }, 403);
  }

  // Серийный/инвентарный номера обязательны для физической техники;
  // кластер виртуализации — логическая сущность, у него их может не быть.
  if (data.serverRole !== CLUSTER_ROLE) {
    if (!data.serialNumber?.trim()) return c.json({ error: 'Укажите серийный номер' }, 400);
    if (!data.inventoryNumber?.trim()) return c.json({ error: 'Укажите инвентарный номер' }, 400);
  }

  // Место размещения: филиал ИЛИ ЦОД. В ЦОД (арендованные/облачные мощности)
  // может размещаться любая инфраструктурная техника: и кластеры, и физические
  // серверы (хосты, СХД, консоли управления), поэтому роль здесь не ограничиваем.
  let branchId: string | null = null;
  let dataCenterId: string | null = null;
  let locationType: string | null = null;
  const hasBranch = !!data.branchId?.trim();
  const hasDC = !!data.dataCenterId?.trim();
  if (hasBranch && hasDC) return c.json({ error: 'Выберите что-то одно: филиал или ЦОД' }, 400);
  if (hasDC) {
    dataCenterId = await resolveRef('dataCenter', data.dataCenterId!);
    if (!dataCenterId) return c.json({ error: 'ЦОД выбран некорректно' }, 400);
    locationType = 'data_center';
  } else if (hasBranch) {
    branchId = await resolveRef('branch', data.branchId!);
    if (!branchId) return c.json({ error: 'Филиал выбран некорректно' }, 400);
    locationType = 'branch';
  } else if (data.serverRole === CLUSTER_ROLE) {
    return c.json({ error: 'Выберите место размещения: филиал или ЦОД' }, 400);
  } else {
    return c.json({ error: 'Выберите филиал' }, 400);
  }
  const assignedToEmployeeId = await resolveRef('employee', data.assignedToEmployeeId);
  // Кластер — логическая сущность (совокупность другого оборудования и консоли
  // управления), не материальный объект учёта: МОЛ, инвентарный и серийный
  // номера у него отсутствуют гарантированно на уровне API.
  const materiallyResponsibleEmployeeId = data.serverRole === CLUSTER_ROLE
    ? null
    : await resolveRef('employee', data.materiallyResponsibleEmployeeId);
  if (data.serverRole === CLUSTER_ROLE) {
    data.serialNumber = null;
    data.inventoryNumber = null;
  }

  const duplicate = data.inventoryNumber ? await prisma.equipment.findUnique({ where: { inventoryNumber: data.inventoryNumber } }) : null;
  if (duplicate) {
    return c.json({ error: 'Инвентарный номер уже используется' }, 409);
  }

  // Кластер (serverRole === 'cluster') не может быть помещён внутрь другого кластера,
  // не может включать сам себя и не может находиться внутри собственного члена.
  if (data.serverRole === CLUSTER_ROLE) data.parentClusterId = null;
  let parentClusterId: string | null = null;
  try {
    parentClusterId = await validateParentCluster(await resolveRef('equipment', data.parentClusterId));
  } catch (e) {
    if (e instanceof VmHostError) return c.json({ error: e.message }, 400);
    throw e;
  }

  const item = await prisma.equipment.create({
    data: {
      organizationId: scope.orgId,
      name: data.name,
      category: data.category,
      serialNumber: data.serialNumber ?? null,
      inventoryNumber: data.inventoryNumber ?? null,
      brand: data.brand ?? null,
      model: data.model ?? null,
      condition: data.condition ?? 'good',
      floor: data.floor ?? null,
      room: data.room ?? null,
      serverRole: data.serverRole ?? null,
      hypervisorName: data.hypervisorName ?? null,
      clusterName: data.clusterName ?? null,
      hypervisorVersion: data.hypervisorVersion ?? null,
      storageType: data.storageType ?? null,
      storageProtocol: data.storageProtocol ?? null,
      storageCapacityGB: data.storageCapacityGB ?? null,
      parentClusterId,
      cpuCores: data.cpuCores ?? null,
      ramGB: data.ramGB ?? null,
      diskGB: data.diskGB ?? null,
      notes: data.notes ?? null,
      branchId,
      dataCenterId,
      locationType,
      assignedToEmployeeId,
      materiallyResponsibleEmployeeId,
      purchaseDate: normalizeDateField(data.purchaseDate),
      writeOffDate: normalizeDateField(data.writeOffDate),
      updatedById: currentUser.userId,
    },
    include: equipmentInclude,
  });

  await createHistoryEntry('equipment', item.id, currentUser.fullName);
  // Состав кластера (ClusterForm): привязка выбранных хостов/СХД/консолей управления
  if (requestedMembers !== null && item.serverRole === CLUSTER_ROLE) {
    try {
      await applyClusterMembers(item.id, item.organizationId, requestedMembers);
    } catch (e) {
      if (e instanceof VmHostError) return c.json({ error: e.message }, 400);
      console.error('applyClusterMembers(create) failed:', e);
      return c.json({ error: 'Не удалось применить состав кластера' }, 400);
    }
  }
  // У логических сущностей (кластеров) инвентарного номера может не быть —
  // не печатаем в аудите «инв. null».
  const invLabel = item.inventoryNumber ? ` (инв. ${item.inventoryNumber})` : '';
  await writeAudit(currentUser, 'create', 'equipment', item.id, item.name, `Добавлено оборудование "${item.name}"${invLabel}`, c.req.header('x-forwarded-for'));

  return c.json(publicEquipmentBrief(item), 201);
});

// sysadmin допускается (см. проверку isInfraEquipment ниже): может править карточки серверов/кластеров
app.put('/api/equipment/:id', authMiddleware, requireRole([...EQUIPMENT_MANAGE_ROLES, 'sysadmin']), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => null);
  // ClusterForm передаёт состав кластера служебным полем __members — извлекаем до валидации
  const requestedMembers = Array.isArray(body?.__members) ? body.__members : null;
  if (body && '__members' in body) delete body.__members;
  const parsed = equipmentSchema.partial().safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return c.json({ error: first?.message && first.message !== 'Invalid input' ? `Некорректные данные: ${first.message}` : 'Некорректные данные' }, 400);
  }
  const currentUser = c.get('user');

  const old = await prisma.equipment.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  // sysadmin может править только инфраструктурную технику (серверы/кластеры/СХД —
  // роль в виртуализации задана у текущего ИЛИ запрашиваемого значения);
  // офисное оборудование остаётся за admin+HR.
  const resultingServerRole = 'serverRole' in parsed.data ? parsed.data.serverRole : old.serverRole;
  if (!EQUIPMENT_MANAGE_ROLES.includes(roleOf(c)) && !isInfraEquipment(old.serverRole) && !isInfraEquipment(resultingServerRole)) {
    return c.json({ error: 'Недостаточно прав: системному администратору доступно только редактирование серверов и кластеров' }, 403);
  }

  const newData: any = { ...parsed.data };
  // Место размещения (филиал/ЦОД): нормализуем пустые строки в null и синхронизируем locationType.
  // Значения undefined означают «поле не передавалось» — старое размещение сохраняется.
  if ('branchId' in newData || 'dataCenterId' in newData) {
    let nextBranchId: string | null | undefined;
    let nextDataCenterId: string | null | undefined;
    if ('branchId' in newData) {
      const rawBranch = typeof newData.branchId === 'string' && newData.branchId.trim() ? newData.branchId : null;
      nextBranchId = rawBranch === null ? null : await resolveRef('branch', rawBranch) ?? old.branchId;
    }
    if ('dataCenterId' in newData) {
      const rawDc = typeof newData.dataCenterId === 'string' && newData.dataCenterId.trim() ? newData.dataCenterId : null;
      nextDataCenterId = rawDc === null ? null : await resolveRef('dataCenter', rawDc, undefined) ?? old.dataCenterId;
    }
    if (nextBranchId && nextDataCenterId) return c.json({ error: 'Выберите что-то одно: филиал или ЦОД' }, 400);
    // Размещение в ЦОД разрешено любой инфраструктурной технике (кластерам и
    // физическим серверам на арендованных/облачных мощностях) — ограничение по роли снято.
    if ('branchId' in newData) newData.branchId = nextBranchId ?? null;
    if ('dataCenterId' in newData) newData.dataCenterId = nextDataCenterId ?? null;
    newData.locationType = newData.dataCenterId ? 'data_center' : newData.branchId ? 'branch' : null;
  }
  if ('assignedToEmployeeId' in newData) newData.assignedToEmployeeId = await resolveRef('employee', newData.assignedToEmployeeId);
  // МОЛ: пустой выбор/несуществующий сотрудник => null (снятие МОЛ), а не
  // undefined — иначе запись «не обновляется», и история молчит о снятии МОЛ.
  if ('materiallyResponsibleEmployeeId' in newData) newData.materiallyResponsibleEmployeeId = await resolveRef('employee', newData.materiallyResponsibleEmployeeId) ?? null;
  // Итоговая роль (после применения PATCH) — cluster => принудительно обнуляем эти поля,
  // включая снятие ранее ошибочно назначенного МОЛ.
  {
    const effectiveRole = 'serverRole' in newData ? (newData.serverRole || null) : old.serverRole;
    if (effectiveRole === CLUSTER_ROLE) {
      newData.materiallyResponsibleEmployeeId = null;
      newData.serialNumber = null;
      newData.inventoryNumber = null;
    }
  }
  if ('purchaseDate' in newData) newData.purchaseDate = normalizeDateField(newData.purchaseDate);
  if ('writeOffDate' in newData) newData.writeOffDate = normalizeDateField(newData.writeOffDate);
  if ('serverRole' in newData) newData.serverRole = newData.serverRole || null;
  if ('hypervisorName' in newData) newData.hypervisorName = newData.hypervisorName || null;
  if ('clusterName' in newData) newData.clusterName = newData.clusterName || null;
  if ('hypervisorVersion' in newData) newData.hypervisorVersion = newData.hypervisorVersion || null;
  if ('storageType' in newData) newData.storageType = newData.storageType || null;
  if ('storageProtocol' in newData) newData.storageProtocol = newData.storageProtocol || null;
  if ('parentClusterId' in newData) {
    try {
      newData.parentClusterId = await validateParentCluster(await resolveRef('equipment', newData.parentClusterId), id);
    } catch (e) {
      if (e instanceof VmHostError) return c.json({ error: e.message }, 400);
      throw e;
    }
  }
  // Кластер не может сам находиться внутри кластера — снимаем привязку при смене роли
  if (newData.serverRole === 'cluster') newData.parentClusterId = null;
  // Смена роли: если сервер перестал быть кластером, его члены нельзя «вешать в никуда» —
  // отвязываем их, иначе на странице платформы хосты останутся «в несуществующем кластере»
  if ('serverRole' in newData && old.serverRole === 'cluster' && newData.serverRole !== 'cluster') {
    await prisma.equipment.updateMany({ where: { parentClusterId: id }, data: { parentClusterId: null } });
  }
  if ('inventoryNumber' in newData && newData.inventoryNumber !== old.inventoryNumber) {
    const dup = await prisma.equipment.findUnique({ where: { inventoryNumber: newData.inventoryNumber } });
    if (dup) return c.json({ error: 'Инвентарный номер уже используется' }, 409);
  }
  newData.updatedById = currentUser.userId;

  const item = await prisma.equipment.update({ where: { id }, data: newData, include: equipmentInclude });

  // Состав кластера (ClusterForm): привязка/отвязка хостов, СХД и консолей управления.
  // До применения — снимок текущего состава, после — новый: разница попадёт в историю.
  let clusterMembersBefore: string[] | undefined;
  let clusterMembersAfter: string[] | undefined;
  if (requestedMembers !== null && item.serverRole === CLUSTER_ROLE) {
    clusterMembersBefore = (await prisma.equipment.findMany({
      where: { parentClusterId: id }, select: { id: true },
    })).map((m) => m.id);
    try {
      await applyClusterMembers(item.id, item.organizationId, requestedMembers);
    } catch (e) {
      if (e instanceof VmHostError) return c.json({ error: e.message }, 400);
      console.error('applyClusterMembers(update) failed:', e);
      return c.json({ error: 'Не удалось применить состав кластера' }, 400);
    }
    clusterMembersAfter = (await prisma.equipment.findMany({
      where: { parentClusterId: id }, select: { id: true },
    })).map((m) => m.id);
  }

  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'equipment',
    entityId: id,
    entityName: item.name,
    oldObj: old as any,
    newData,
    clusterMembersBefore,
    clusterMembersAfter,
  });

  return c.json(publicEquipmentBrief(item));
});

app.delete('/api/equipment/:id', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.equipment.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);
  const scope = await getUserOrgScope(currentUser.userId);
  if (old.organizationId && old.organizationId !== scope.orgId) {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }

  await prisma.equipment.delete({ where: { id } });
  const invLabelDel = old.inventoryNumber ? ` (инв. ${old.inventoryNumber})` : '';
  await writeAudit(currentUser, 'delete', 'equipment', id, old.name, `Удалено оборудование "${old.name}"${invLabelDel}`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// Assign / unassign equipment to employee
app.post('/api/equipment/:id/assign', authMiddleware, requireRole(ASSIGN_ROLES), async (c) => {
  const { id } = c.req.param();
  const parsed = z.object({ employeeId: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);

  const currentUser = c.get('user');
  const item = await prisma.equipment.findUnique({ where: { id } });
  if (!item) return c.json({ error: 'Not found' }, 404);

  const employeeId = await resolveRef('employee', parsed.data.employeeId);
  if (!employeeId) return c.json({ error: 'Сотрудник не найден' }, 400);

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  const oldEmployee = item.assignedToEmployeeId
    ? await prisma.employee.findUnique({ where: { id: item.assignedToEmployeeId } })
    : null;

  const empName = (e: any) => (e ? `${e.lastName} ${e.firstName}${e.middleName ? ' ' + e.middleName : ''}` : 'не закреплено');

  const updated = await prisma.equipment.update({
    where: { id },
    data: { assignedToEmployeeId: employeeId, updatedById: currentUser.userId },
    include: equipmentInclude,
  });

  await prisma.equipmentAssignment.create({
    data: { equipmentId: id, employeeId, assignedBy: currentUser.userId },
  });

  await prisma.historyRecord.create({
    data: {
      entityType: 'equipment',
      entityId: id,
      action: 'assigned',
      fieldName: 'закреплено за',
      oldValue: empName(oldEmployee),
      newValue: empName(employee),
      changedBy: currentUser.fullName,
    },
  });
  await writeAudit(currentUser, 'assign', 'equipment', id, item.name, `Закреплено за сотрудником "${empName(employee)}"`, c.req.header('x-forwarded-for'));

  return c.json(publicEquipmentBrief(updated));
});

app.post('/api/equipment/:id/unassign', authMiddleware, requireRole(ASSIGN_ROLES), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const item = await prisma.equipment.findUnique({ where: { id } });
  if (!item) return c.json({ error: 'Not found' }, 404);
  if (!item.assignedToEmployeeId) {
    return c.json({ error: 'Оборудование не закреплено ни за кем' }, 400);
  }

  const oldEmployee = await prisma.employee.findUnique({ where: { id: item.assignedToEmployeeId } });
  const empName = oldEmployee ? `${oldEmployee.lastName} ${oldEmployee.firstName}${oldEmployee.middleName ? ' ' + oldEmployee.middleName : ''}` : '—';

  const updated = await prisma.equipment.update({
    where: { id },
    data: { assignedToEmployeeId: null, updatedById: currentUser.userId },
    include: equipmentInclude,
  });

  await prisma.equipmentAssignment.updateMany({
    where: { equipmentId: id, returnedDate: null },
    data: { returnedDate: new Date() },
  });

  await prisma.historyRecord.create({
    data: {
      entityType: 'equipment',
      entityId: id,
      action: 'unassigned',
      fieldName: 'откреплено',
      oldValue: empName,
      changedBy: currentUser.fullName,
    },
  });
  await writeAudit(currentUser, 'unassign', 'equipment', id, item.name, `Откреплено от сотрудника "${empName}"`, c.req.header('x-forwarded-for'));

  return c.json(publicEquipmentBrief(updated));
});

// ============================================================
// Virtual Machines Routes
// ============================================================
const vmSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя ВМ'),
  hostname: z.string().trim().min(1, 'Укажите hostname'),
  type: z.enum(['virtual', 'container', 'cloud']).optional(),
  hostServerId: z.string().optional().nullable(),
  os: z.string().optional().nullable(),
  cpuCores: z.number().int().min(0).optional(),
  // RAM/диск допускают дробные значения (ввод через запятую, косяк 10)
  ramGB: z.number().min(0).optional(),
  diskGB: z.number().min(0).optional(),
  responsibleEmployeeId: z.string().optional().nullable(),
  serviceResponsibleEmployeeId: z.string().optional().nullable(),
  // МОЛ (материально ответственное лицо) — сотрудник, на подотчёте которого числится ВМ
  materiallyResponsibleEmployeeId: strOrEmpty(z.string()),
  status: z.enum(['running', 'stopped', 'maintenance', 'decommissioned']).optional(),
  // Пустая строка / null = «роль не назначена» (автономный сервер без роли в
  // виртуализации тоже может быть хостом для ВМ) — нормализуем в null, чтобы
  // zod не падал с «Invalid enum value ... received ''».
  serverRole: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.enum(['hypervisor_host', 'storage', 'management_console', 'standalone']).nullable().optional(),
  ),
  provisionedOn: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const vmInclude = {
  hostServer: true,
  responsibleEmployee: true,
  serviceResponsibleEmployee: true,
  materiallyResponsibleEmployee: true,
  networkInterfaces: true,
  services: true,
} as const;

// Кластер ВМ определяется автоматически по хост-серверу: ВМ размещается на
// хосте, а хост (если входит в кластер) имеет parentClusterId -> кластер.
async function resolveVmClusterIds(vmList: any[]): Promise<void> {
  const hostIds = Array.from(new Set(vmList.map((v) => v.hostServerId).filter(Boolean)));
  if (hostIds.length === 0) return;
  const hosts = await prisma.equipment.findMany({
    where: { id: { in: hostIds } },
    select: { id: true, parentClusterId: true },
  });
  const byHost = new Map(hosts.map((h) => [h.id, h.parentClusterId ?? null]));
  for (const v of vmList) {
    v.vmClusterId = v.hostServerId ? byHost.get(v.hostServerId) ?? null : null;
  }
}

app.get('/api/virtual-machines', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const where: any = {};
  if (scope.orgId) where.organizationId = scope.orgId; else where.organizationId = null;
  const vms = await prisma.virtualMachine.findMany({ where, include: vmInclude, orderBy: { createdAt: 'desc' } });
  await resolveVmClusterIds(vms);
  return c.json(vms.map(publicVM));
});

app.get('/api/virtual-machines/:id', authMiddleware, async (c) => {
  const vm = await prisma.virtualMachine.findUnique({ where: { id: c.req.param('id') }, include: vmInclude });
  if (!vm) return c.json({ error: 'Not found' }, 404);
  await resolveVmClusterIds([vm]);
  return c.json(publicVM(vm));
});

app.get('/api/virtual-machines/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'virtualmachine', entityId: c.req.param('id') },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/virtual-machines', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const parsed = vmSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return c.json({ error: first?.message && first.message !== 'Invalid input' ? `Некорректные данные ВМ: ${first.message}` : 'Некорректные данные ВМ' }, 400);
  }
  const currentUser = c.get('user');
  const data = parsed.data;
  const scope = await getUserOrgScope(currentUser.userId);

  const hostServerId = await resolveRef('equipment', data.hostServerId);
  const responsibleEmployeeId = await resolveRef('employee', data.responsibleEmployeeId);
  const serviceResponsibleEmployeeId = await resolveRef('employee', data.serviceResponsibleEmployeeId);
  const materiallyResponsibleEmployeeId = await resolveRef('employee', data.materiallyResponsibleEmployeeId);
  // Хост обязателен: без него ВМ «нигде не живёт» и её нельзя ни разместить,
  // ни отнести к кластеру (кластер определяется автоматически по хосту).
  if (!hostServerId) {
    return c.json({ error: 'Не выбран хост-сервер. Укажите физический сервер-хост гипервизора, на котором размещена ВМ — без хоста создать ВМ нельзя.' }, 400);
  }
  const hostExists = await prisma.equipment.findUnique({ where: { id: hostServerId }, select: { id: true, name: true } });
  if (!hostExists) {
    return c.json({ error: 'Выбранный хост-сервер не найден (возможно, удалён). Обновите страницу и выберите существующий хост.' }, 400);
  }
  try {
    await assertVmHostIsHypervisor(hostServerId);
  } catch (e) {
    if (e instanceof VmHostError) return c.json({ error: e.message }, 400);
    throw e;
  }

  const vm = await prisma.virtualMachine.create({
    data: {
      organizationId: scope.orgId,
      name: data.name,
      hostname: data.hostname,
      type: data.type ?? 'virtual',
      os: data.os ?? null,
      status: data.status ?? 'running',
      serverRole: data.serverRole ?? null,
      provisionedOn: data.provisionedOn ?? null,
      notes: data.notes ?? null,
      cpuCores: data.cpuCores ?? 2,
      ramGB: data.ramGB ?? 4,
      diskGB: data.diskGB ?? 50,
      hostServerId,
      responsibleEmployeeId,
      serviceResponsibleEmployeeId,
      materiallyResponsibleEmployeeId,
      updatedById: currentUser.userId,
    },
    include: vmInclude,
  });
  await resolveVmClusterIds([vm]);

  await createHistoryEntry('virtualmachine', vm.id, currentUser.fullName);
  await writeAudit(currentUser, 'create', 'virtualmachine', vm.id, vm.name, `Добавлена ВМ "${vm.name}" (${vm.hostname})`, c.req.header('x-forwarded-for'));

  return c.json(publicVM(vm), 201);
});

app.put('/api/virtual-machines/:id', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { id } = c.req.param();
  const parsed = vmSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return c.json({ error: first?.message && first.message !== 'Invalid input' ? `Некорректные данные: ${first.message}` : 'Некорректные данные' }, 400);
  }
  const currentUser = c.get('user');

  const old = await prisma.virtualMachine.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  // Снимок кластера «до» (вычисляется по хост-серверу): чтобы история ВМ
  // показывала и перемещение между кластерами, а не только смену хоста.
  const clusterBefore = old.hostServerId
    ? await prisma.equipment.findUnique({ where: { id: old.hostServerId }, select: { parentClusterId: true } })
    : null;

  const newData: any = { ...parsed.data };
  if ('hostServerId' in newData) {
    newData.hostServerId = await resolveRef('equipment', newData.hostServerId);
    // Снять хост с существующей ВМ нельзя — она «повиснет» без размещения
    if (!newData.hostServerId) {
      return c.json({ error: 'Нельзя убрать хост-сервер у ВМ. Выберите хост, на котором размещена ВМ.' }, 400);
    }
    try {
      await assertVmHostIsHypervisor(newData.hostServerId);
    } catch (e) {
      if (e instanceof VmHostError) return c.json({ error: e.message }, 400);
      throw e;
    }
  } else if (!old.hostServerId) {
    return c.json({ error: 'У ВМ не задан хост-сервер. Выберите хост для сохранения.' }, 400);
  }
  if ('responsibleEmployeeId' in newData) newData.responsibleEmployeeId = await resolveRef('employee', newData.responsibleEmployeeId) ?? null;
  if ('serviceResponsibleEmployeeId' in newData) newData.serviceResponsibleEmployeeId = await resolveRef('employee', newData.serviceResponsibleEmployeeId) ?? null;
  // МОЛ ВМ: пустой выбор => null (снятие), иначе история не фиксировала бы снятие МОЛ.
  if ('materiallyResponsibleEmployeeId' in newData) newData.materiallyResponsibleEmployeeId = await resolveRef('employee', newData.materiallyResponsibleEmployeeId) ?? null;
  if ('serverRole' in newData) newData.serverRole = newData.serverRole || null;
  if ('provisionedOn' in newData) newData.provisionedOn = newData.provisionedOn || null;
  newData.updatedById = currentUser.userId;

  const vm = await prisma.virtualMachine.update({ where: { id }, data: newData, include: vmInclude });
  await resolveVmClusterIds([vm]);

  // Кластер ВМ — производное поле (родитель хост-сервера): добавляем в diff
  // только при реальном перемещении между кластерами (applyUpdate пропускает
  // его ключ, если значение не изменилось).
  const clusterAfterId = vm.hostServerId
    ? await prisma.equipment.findUnique({ where: { id: vm.hostServerId }, select: { parentClusterId: true } })
    : null;
  const extraChanges: { field: string; oldValue: string; newValue: string; summary: string }[] = [];
  if ((clusterBefore?.parentClusterId ?? null) !== (clusterAfterId?.parentClusterId ?? null)) {
    const hostName = await historyDisplayValue('hostServerId', vm.hostServerId);
    const beforeLabel = clusterBefore?.parentClusterId
      ? await historyDisplayValue('parentClusterId', clusterBefore.parentClusterId) : '—';
    const afterLabel = clusterAfterId?.parentClusterId
      ? await historyDisplayValue('parentClusterId', clusterAfterId.parentClusterId) : '—';
    // Строка «кластер: X → Y» — про клики внутри ВМ (переезд на хост вне кластера).
    recordChange(extraChanges, 'кластер (виртуальный)', beforeLabel, afterLabel);
    // И событие в истории самого кластера («добавлен/исключён ВМ …») — чтобы
    // перемещение ВМ было видно и со стороны кластеров.
    const selfLabel = `ВМ ${vm.name}`;
    if (clusterAfterId?.parentClusterId) {
      await writeHistoryBatch('equipment', clusterAfterId.parentClusterId, currentUser.fullName, [{
        field: 'состав кластера', oldValue: '—', newValue: `добавлен: ${selfLabel}`,
        summary: `состав кластера: "—" → "добавлен: ${selfLabel}"`,
      }]);
    }
    if (clusterBefore?.parentClusterId && clusterBefore.parentClusterId !== clusterAfterId?.parentClusterId) {
      await writeHistoryBatch('equipment', clusterBefore.parentClusterId, currentUser.fullName, [{
        field: 'состав кластера', oldValue: `исключён: ${selfLabel}`, newValue: '—',
        summary: `состав кластера: "исключён: ${selfLabel}" → "—"`,
      }]);
    }
  }

  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'virtualmachine',
    entityId: id,
    entityName: vm.name,
    oldObj: old as any,
    newData,
    extraChanges,
  });

  return c.json(publicVM(vm));
});

app.delete('/api/virtual-machines/:id', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.virtualMachine.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);
  const scope = await getUserOrgScope(currentUser.userId);
  if (old.organizationId && old.organizationId !== scope.orgId) {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }

  await prisma.virtualMachine.delete({ where: { id } });
  await writeAudit(currentUser, 'delete', 'virtualmachine', id, old.name, `Удалена ВМ "${old.name}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// Network Interfaces
app.post('/api/virtual-machines/:vmId/network-interfaces', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { vmId } = c.req.param();
  const parsed = z.object({
    name: z.string().min(1),
    macAddress: z.string().min(1),
    ipAddress: z.string().min(1),
    isPublic: z.boolean().optional(),
    notes: z.string().optional().nullable(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные интерфейса' }, 400);

  const currentUser = c.get('user');
  const vm = await prisma.virtualMachine.findUnique({ where: { id: vmId } });
  if (!vm) return c.json({ error: 'ВМ не найдена' }, 404);

  const ni = await prisma.networkInterface.create({
    data: {
      name: parsed.data.name,
      macAddress: parsed.data.macAddress,
      ipAddress: parsed.data.ipAddress,
      isPublic: parsed.data.isPublic ?? false,
      notes: parsed.data.notes ?? null,
      virtualMachineId: vmId,
      updatedById: currentUser.userId ?? undefined,
    },
  });

  // Каскадно «трогаем» ВМ: updatedAt/updatedBy на карточке должны отражать последнее изменение интерфейса
  await prisma.virtualMachine.update({ where: { id: vmId }, data: { updatedById: currentUser.userId ?? undefined } });
  await writeAudit(currentUser, 'create', 'virtualmachine', vmId, vm.name, `Добавлен сетевой интерфейс "${ni.name}" (${ni.ipAddress})`, c.req.header('x-forwarded-for'));
  return c.json(ni, 201);
});

app.put('/api/network-interfaces/:id', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { id } = c.req.param();
  const parsed = z.object({
    name: z.string().min(1).optional(),
    macAddress: z.string().min(1).optional(),
    ipAddress: z.string().min(1).optional(),
    isPublic: z.boolean().optional(),
    notes: z.string().optional().nullable(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);

  const currentUser = c.get('user');
  const old = await prisma.networkInterface.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  const ni = await prisma.networkInterface.update({
    where: { id },
    data: { ...parsed.data, updatedById: currentUser.userId ?? undefined },
  });

  await prisma.virtualMachine.update({ where: { id: old.virtualMachineId }, data: { updatedById: currentUser.userId ?? undefined } });
  await writeAudit(currentUser, 'update', 'virtualmachine', old.virtualMachineId, '', `Изменён сетевой интерфейс "${ni.name}"`, c.req.header('x-forwarded-for'));
  return c.json(ni);
});

app.delete('/api/network-interfaces/:id', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.networkInterface.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  await prisma.networkInterface.delete({ where: { id } });
  await prisma.virtualMachine.update({ where: { id: old.virtualMachineId }, data: { updatedById: currentUser.userId ?? undefined } });
  await writeAudit(currentUser, 'delete', 'virtualmachine', old.virtualMachineId, '', `Удалён сетевой интерфейс "${old.name}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// Разбирает поле «порты»: принимает строку ("80, 443", "80/443", "80; 443"),
// число или null. Валидирует каждый порт (1..65535) и возвращает нормализованную
// строку "80, 443". undefined — поле не менялось; ошибка — некорректный порт.
function parsePorts(v: unknown): { value?: string | null; error?: string } {
  if (v === undefined) return {};
  if (v === null || v === '') return { value: null };
  const parts = String(v).split(/[,;\/\s]+/).filter(Boolean);
  if (parts.length === 0) return { value: null };
  const nums: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return { error: `Некорректный порт «${part}» (ожидается число 1–65535)` };
    nums.push(n);
  }
  const uniq = [...new Set(nums)];
  return { value: uniq.join(', ') };
}

// Services on VMs
app.post('/api/virtual-machines/:vmId/services', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { vmId } = c.req.param();
  const parsed = z.object({
    name: z.string().min(1),
    version: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive', 'maintenance']).optional(),
  }).passthrough().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные сервиса' }, 400);
  const ports = parsePorts((parsed.data as any).port);
  if (ports.error) return c.json({ error: ports.error }, 400);

  const currentUser = c.get('user');
  const vm = await prisma.virtualMachine.findUnique({ where: { id: vmId } });
  if (!vm) return c.json({ error: 'ВМ не найдена' }, 404);

  const service = await prisma.service.create({
    data: {
      name: parsed.data.name,
      version: parsed.data.version ?? null,
      port: ports.value ?? null,
      description: parsed.data.description ?? null,
      status: parsed.data.status ?? 'active',
      virtualMachineId: vmId,
      updatedById: currentUser.userId ?? undefined,
    },
  });

  await prisma.virtualMachine.update({ where: { id: vmId }, data: { updatedById: currentUser.userId ?? undefined } });
  await writeAudit(currentUser, 'create', 'virtualmachine', vmId, vm.name, `Добавлен сервис "${service.name}"`, c.req.header('x-forwarded-for'));
  return c.json(service, 201);
});

app.put('/api/services/:id', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { id } = c.req.param();
  const parsed = z.object({
    name: z.string().min(1).optional(),
    version: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive', 'maintenance']).optional(),
  }).passthrough().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);
  const ports = parsePorts((parsed.data as any).port);
  if (ports.error) return c.json({ error: ports.error }, 400);

  const currentUser = c.get('user');
  const old = await prisma.service.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  const { port: _rawPort, ...restData } = parsed.data as any;
  const service = await prisma.service.update({
    where: { id },
    data: { ...restData, ...(ports.value !== undefined ? { port: ports.value } : {}), updatedById: currentUser.userId ?? undefined },
  });

  await prisma.virtualMachine.update({ where: { id: old.virtualMachineId }, data: { updatedById: currentUser.userId ?? undefined } });
  await writeAudit(currentUser, 'update', 'virtualmachine', old.virtualMachineId, '', `Изменён сервис "${service.name}"`, c.req.header('x-forwarded-for'));
  return c.json(service);
});

app.delete('/api/services/:id', authMiddleware, requireRole(SERVER_ROLES), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.service.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  await prisma.service.delete({ where: { id } });
  await prisma.virtualMachine.update({ where: { id: old.virtualMachineId }, data: { updatedById: currentUser.userId ?? undefined } });
  await writeAudit(currentUser, 'delete', 'virtualmachine', old.virtualMachineId, '', `Удалён сервис "${old.name}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// ============================================================
// Directories Routes (Departments, Positions, Branches)
// ============================================================
interface DirConfig {
  model: 'department' | 'position' | 'branch' | 'dataCenter';
  route: string;
  label: string;
  requiredBranchAddress?: boolean;
}

const directoryConfigs: DirConfig[] = [
  { model: 'department', route: 'departments', label: 'Отдел' },
  { model: 'position', route: 'positions', label: 'Должность' },
  { model: 'branch', route: 'branches', label: 'Филиал' },
  { model: 'dataCenter', route: 'data-centers', label: 'ЦОД' },
];

for (const cfg of directoryConfigs) {
  app.get(`/api/${cfg.route}`, authMiddleware, async (c) => {
    // Мультиорганизационность: справочник принадлежит активной организации.
    // Показываем записи только текущей организации + старые глобальные записи без
    // привязки (organizationId = null) — для совместимости с данными до миграции.
    const me = await prisma.user.findUnique({ where: { id: c.get('user').userId }, select: { organizationId: true } });
    const items: any[] = await (prisma as any)[cfg.model].findMany({
      // Активная организация + старые глобальные записи (organizationId = null)
      where: me?.organizationId
        ? { OR: [{ organizationId: me.organizationId }, { organizationId: null }] }
        : {},
      orderBy: { name: 'asc' },
    });
    return c.json(items.map(publicDirectory));
  });

  app.post(`/api/${cfg.route}`, authMiddleware, requireRole(['admin']), async (c) => {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      organizationId: z.union([z.string().uuid(), z.null()]).optional(),
      ...(cfg.model === 'branch' ? { address: z.string().min(1) } : {}),
      ...(cfg.model === 'dataCenter' ? { owner: z.string().min(1), address: z.string().optional().nullable() } : {}),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);

    const currentUser = c.get('user');
    // Активная организация пользователя — источник скоупа справочника.
    // organizationId из тела запроса учитывается только если он пустой/отсутствует.
    const dbUser = await prisma.user.findUnique({ where: { id: currentUser.userId }, select: { organizationId: true } });
    const orgId = dbUser?.organizationId ?? parsed.data.organizationId ?? null;

    const orgWhere: any = { name: parsed.data.name };
    if (orgId) orgWhere.organizationId = orgId;
    const exists = await (prisma as any)[cfg.model].findFirst({ where: orgWhere });
    if (exists) return c.json({ error: `Запись «${parsed.data.name}» уже существует` }, 409);

    const item = await (prisma as any)[cfg.model].create({
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description ?? null,
        ...(cfg.model === 'branch' ? { address: parsed.data.address } : {}),
        ...(cfg.model === 'dataCenter' ? { owner: parsed.data.owner, address: parsed.data.address ?? null } : {}),
        organizationId: orgId,
        updatedById: currentUser.userId,
      },
    });

    await createHistoryEntry(cfg.model, item.id, currentUser.fullName);
    await writeAudit(currentUser, 'create', cfg.model, item.id, item.name, `Создан справочник: ${cfg.label.toLowerCase()} «${item.name}»`, c.req.header('x-forwarded-for'));
    return c.json(item, 201);
  });

  app.put(`/api/${cfg.route}/:id`, authMiddleware, requireRole(['admin']), async (c) => {
    const { id } = c.req.param();
    const parsed = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      ...(cfg.model === 'branch' ? { address: z.string().min(1).optional() } : {}),
      ...(cfg.model === 'dataCenter' ? { owner: z.string().min(1).optional(), address: z.string().optional().nullable() } : {}),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);

    const currentUser = c.get('user');
    const old: any = await (prisma as any)[cfg.model].findUnique({ where: { id } });
    if (!old) return c.json({ error: 'Not found' }, 404);

    if (parsed.data.name && parsed.data.name !== old.name) {
      const clashWhere: any = { name: parsed.data.name };
      if (old.organizationId) clashWhere.organizationId = old.organizationId;
      const clash = await (prisma as any)[cfg.model].findFirst({ where: clashWhere });
      if (clash) return c.json({ error: `Запись «${parsed.data.name}» уже существует` }, 409);
    }

    const newData: any = { ...parsed.data, updatedById: currentUser.userId };
    const item: any = await (prisma as any)[cfg.model].update({ where: { id }, data: newData });

    await applyUpdate({
      ctx: currentUser,
      ipAddress: c.req.header('x-forwarded-for'),
      entityType: cfg.model,
      entityId: id,
      entityName: item.name,
      oldObj: old,
      newData,
    });

    return c.json(item);
  });

  app.delete(`/api/${cfg.route}/:id`, authMiddleware, requireRole(['admin']), async (c) => {
    const { id } = c.req.param();
    const currentUser = c.get('user');
    const old: any = await (prisma as any)[cfg.model].findUnique({ where: { id } });
    if (!old) return c.json({ error: 'Not found' }, 404);

    // Защита от нарушения ссылочной целостности
    const usageChecks: Array<{ model: string; field: string }> = cfg.model === 'branch'
      ? [{ model: 'employee', field: 'branchId' }, { model: 'equipment', field: 'branchId' }]
      : cfg.model === 'department'
        ? [{ model: 'employee', field: 'departmentId' }]
        : [{ model: 'employee', field: 'positionId' }];

    for (const check of usageChecks) {
      const used = await (prisma as any)[check.model].count({ where: { [check.field]: id } });
      if (used > 0) {
        return c.json({ error: `Запись используется (${used} раз) — удаление запрещено` }, 409);
      }
    }

    await (prisma as any)[cfg.model].delete({ where: { id } });
    await writeAudit(currentUser, 'delete', cfg.model, id, old.name, `Удалён справочник: ${cfg.label.toLowerCase()} «${old.name}»`, c.req.header('x-forwarded-for'));
    return c.json({ success: true });
  });
}

// ============================================================
// Администрирование системы: заявки на вступление в организации
// ============================================================
// Жёсткое соответствие UI↔бэкенду: все три эндпоинта доступны только
// администратору системы (requireRole(['admin'])); в интерфейсе раздел
// «Администрирование» скрыт для остальных ролей.
const JOIN_ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  hr_specialist: 'Специалист по кадрам',
  sysadmin: 'Системный администратор',
  materially_responsible: 'Мат. ответственное лицо',
  viewer: 'Пользователь',
};

// Роли, которые администратор системы может выдать при одобрении заявки.
// Все роли доступны, включая «Администратор» (в управлении пользователями
// ограничение отсутствовало — привели к единому поведению).
const ASSIGNABLE_JOIN_ROLES = ALL_ROLES;

function publicJoinRequest(r: any) {
  return {
    id: r.id,
    status: r.status as 'pending' | 'approved' | 'rejected',
    assignedRole: r.assignedRole ?? null,
    createdAt: isoDate(r.createdAt),
    updatedAt: isoDate(r.updatedAt),
    applicant: { id: r.applicant.id, fullName: r.applicant.fullName, email: r.applicant.email },
    organization: { id: r.organization.id, name: r.organization.name, shortName: r.organization.shortName },
    approver: r.approver ? { id: r.approver.id, fullName: r.approver.fullName } : null,
  };
}

const joinRequestInclude = {
  applicant: { select: { id: true, fullName: true, email: true } },
  organization: { select: { id: true, name: true, shortName: true } },
  approver: { select: { id: true, fullName: true } },
} as const;

app.get('/api/join-requests', authMiddleware, requireRole(['admin']), async (c) => {
  const status = c.req.query('status'); // pending | approved | rejected (опционально)
  const where = ['pending', 'approved', 'rejected'].includes(status ?? '') ? { status: status as any } : {};
  const requests = await prisma.joinRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: joinRequestInclude,
  });
  return c.json(requests.map(publicJoinRequest));
});

// Одобрение заявки: пользователь сразу привязывается к организации,
// роль выдаёт администратор системы (по умолчанию — «Пользователь»).
app.post('/api/join-requests/:id/approve', authMiddleware, requireRole(['admin']), async (c) => {
  const me = c.get('user');
  const parsed = z
    .object({ role: z.enum(ASSIGNABLE_JOIN_ROLES).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);
  const newRole = parsed.data.role ?? 'viewer';

  const request = await prisma.joinRequest.findUnique({
    where: { id: c.req.param('id') },
    include: joinRequestInclude,
  });
  if (!request) return c.json({ error: 'Заявка не найдена' }, 404);
  if (request.status !== 'pending') return c.json({ error: 'Заявка уже обработана' }, 409);

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: request.applicantId },
      data: { organizationId: request.organizationId, role: newRole },
    }),
    prisma.joinRequest.update({
      where: { id: request.id },
      data: { status: 'approved', assignedRole: newRole, approverId: me.userId },
      include: joinRequestInclude,
    }),
  ]);

  // П.2: меняем роль/организацию у пользователя, который сейчас может быть
  // в системе — переводим tokenVersion, чтобы его старый JWT перестал быть
  // валидным; при следующем запросе он получит 401 и будет перезалогинен
  // уже с актуальной ролью (без «внутренней ошибки сервера» на клиенте).
  try {
    await prisma.user.update({
      where: { id: updated.id },
      data: { tokenVersion: { increment: 1 } },
    });
  } catch {}

  // Одобрение заявки = вступление: фиксируем членство в организации
  await ensureMemberships(request.applicantId, [request.organizationId]);

  await writeHistoryBatch('user', updated.id, me.fullName, [
    { field: 'вступление в организацию', newValue: `роль: ${JOIN_ROLE_LABELS[newRole]}` },
  ]);
  await writeAudit(
    me, 'update', 'join_request', request.id, request.applicant.fullName,
    `Заявка одобрена: ${request.applicant.fullName} → организация «${request.organization.shortName || request.organization.name}», роль «${JOIN_ROLE_LABELS[newRole]}»`,
    c.req.header('x-forwarded-for'),
  );
  return c.json(publicJoinRequest(updated));
});

// Отклонение заявки: пользователь остаётся без организации.
app.post('/api/join-requests/:id/reject', authMiddleware, requireRole(['admin']), async (c) => {
  const me = c.get('user');
  const request = await prisma.joinRequest.findUnique({
    where: { id: c.req.param('id') },
    include: joinRequestInclude,
  });
  if (!request) return c.json({ error: 'Заявка не найдена' }, 404);
  if (request.status !== 'pending') return c.json({ error: 'Заявка уже обработана' }, 409);

  const updated = await prisma.joinRequest.update({
    where: { id: request.id },
    data: { status: 'rejected', approverId: me.userId },
    include: joinRequestInclude,
  });

  await writeAudit(
    me, 'update', 'join_request', request.id, request.applicant.fullName,
    `Заявка отклонена: ${request.applicant.fullName} → организация «${request.organization.shortName || request.organization.name}»`,
    c.req.header('x-forwarded-for'),
  );
  return c.json(publicJoinRequest(updated));
});

// ============================================================
// Audit Log
// ============================================================
app.get('/api/audit-logs', authMiddleware, requireRole(['admin']), async (c) => {
  const take = Math.min(parseInt(c.req.query('limit') || '100', 10) || 100, 500);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  });
  return c.json(logs);
});

// ============================================================
// Продакшн-режим: база стартует пустой.
// Первый администратор создаётся через POST /api/auth/register
// (если таблица users пуста — роль принудительно "admin").
// ============================================================

// ============================================================
// Запуск сервера
// ============================================================
const PORT = parseInt(process.env.PORT || '4000', 10);

async function start() {
  // Повторные попытки подключения к БД: postgres может ещё подниматься,
  // а nginx без запущенного backend отдавал бы 502 на все /api/*
  const maxRetries = 30;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      log.info('Connected to PostgreSQL');
      break;
    } catch (error) {
      if (attempt === maxRetries) {
        log.error(`Failed to connect to PostgreSQL after ${maxRetries} attempts`, error);
        process.exit(1);
      }
      log.info(`PostgreSQL not ready (attempt ${attempt}/${maxRetries}), retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  try {
    serve({
      fetch: app.fetch,
      port: PORT,
    });

    log.info(`Chlenix Backend API listening on port ${PORT}`);
  } catch (error) {
    log.error('Failed to start server', error);
    process.exit(1);
  }
}

start();

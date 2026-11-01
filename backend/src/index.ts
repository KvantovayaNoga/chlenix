// ============================================================
// Chlenix Backend API — Main Entry Point
// Node.js 22 + Hono + Prisma + PostgreSQL
// Все данные приложения хранятся в серверной БД PostgreSQL.
// ============================================================

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
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
    c.set('user', payload as any);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

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
  responsibleEmployeeId: 'ответственный (инфраструктура)',
  serviceResponsibleEmployeeId: 'ответственный (сервисы)',
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
};

function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v);
}

// Вычисляет diff по белому списку отслеживаемых полей и пишет историю + аудит
const TRACKED_KEYS = Object.keys(HISTORY_FIELD_LABELS);

async function applyUpdate(opts: {
  ctx: Ctx;
  ipAddress?: string | null;
  entityType: string;
  entityId: string;
  entityName: string;
  oldObj: Record<string, any>;
  newData: Record<string, any>;
}) {
  const changes: string[] = [];
  for (const key of TRACKED_KEYS) {
    if (!(key in opts.newData)) continue;
    const nv = opts.newData[key];
    if (nv === undefined) continue;
    const ov = opts.oldObj[key];
    const norm = (v: any) => (v instanceof Date ? v.toISOString() : v === undefined ? null : v);
    if (String(norm(ov)) !== String(norm(nv))) {
      changes.push(`${HISTORY_FIELD_LABELS[key]}: "${displayValue(ov)}" → "${displayValue(nv)}"`);
      await prisma.historyRecord.create({
        data: {
          entityType: opts.entityType,
          entityId: opts.entityId,
          action: 'updated',
          fieldName: HISTORY_FIELD_LABELS[key],
          oldValue: displayValue(ov),
          newValue: displayValue(nv),
          changedBy: opts.ctx.fullName,
        },
      });
    }
  }
  await writeAudit(
    opts.ctx,
    'update',
    opts.entityType,
    opts.entityId,
    opts.entityName,
    changes.length > 0 ? `Обновлено: ${changes.join('; ')}` : 'Обновлены данные',
    opts.ipAddress,
  );
}

async function createHistoryEntry(entityType: string, entityId: string, changedBy: string, action = 'created', fieldName = 'создано') {
  await prisma.historyRecord.create({
    data: { entityType, entityId, action, fieldName, changedBy },
  });
}

// Разрешает внешние ключи из строковых ID, возвращает null если записи нет.
// Для справочников (branch/department/position) дополнительно проверяет
// принадлежность организации: запись либо привязана к orgId, либо общая (null).
async function resolveRef(model: 'employee' | 'branch' | 'department' | 'position' | 'equipment', id: unknown, orgId?: string | null): Promise<string | null> {
  if (typeof id !== 'string' || id.trim() === '') return null;
  const where = { id };
  try {
    const found: any = await (prisma as any)[model].findUnique({ where, select: { id: true, organizationId: true } });
    if (!found) return null;
    if (orgId !== undefined && ['branch', 'department', 'position'].includes(model)) {
      if (found.organizationId && orgId && found.organizationId !== orgId) return null;
    }
    return found.id;
  } catch {
    return null;
  }
}

// Безопасно разрешает внешние ключи: undefined остаётся undefined (поле не меняется/не задаётся),
// пустое/несуществующее значение -> null
async function resolveRefOrNull(model: 'employee' | 'branch' | 'department' | 'position' | 'equipment', id: unknown, orgId?: string | null): Promise<string | null | undefined> {
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

// Где может работать пользователь: собственные организации + (для админа) все организации системы.
async function getAccessibleOrgs(userId: string): Promise<Array<{ id: string; name: string; isOwn: boolean }>> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true, role: true } });
  const all = await prisma.organization.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
  if (me?.role === 'admin') return all.map((o) => ({ id: o.id, name: o.name, isOwn: o.id === me.organizationId }));
  return all.filter((o) => o.id === me?.organizationId).map((o) => ({ id: o.id, name: o.name, isOwn: true }));
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
});

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
  if (!user || !user.isActive) {
    return c.json({ error: 'Неверный email или пароль' }, 401);
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

  return c.json({ token, user: publicUser(user) });
});

app.post('/api/auth/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }

  const { email, password, fullName } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return c.json({ error: 'Пользователь с таким email уже существует' }, 400);
  }

  // Первый зарегистрированный пользователь — администратор системы
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? 'admin' : 'viewer';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, password: passwordHash, fullName, role },
  });

  await createHistoryEntry('user', user.id, fullName);
  await writeAudit({ userId: user.id, fullName }, 'create', 'user', user.id, fullName, 'Зарегистрирован новый пользователь');

  const token = await issueToken(user);

  return c.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', authMiddleware, async (c) => {
  const currentUser = c.get('user');
  const user = await prisma.user.findUnique({ where: { id: currentUser.userId } });
  if (!user || !user.isActive) {
    return c.json({ error: 'Пользователь не найден или деактивирован' }, 401);
  }
  // Какие организации доступны пользователю (для переключателя в интерфейсе)
  const accessibleOrganizations = await getAccessibleOrgs(user.id);
  return c.json({ ...publicUser(user), accessibleOrganizations });
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
app.post('/api/auth/switch-organization', authMiddleware, async (c) => {
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

  // Перевыпускаем токен с новой организацией — клиент заменит его в localStorage
  const token = await issueToken(user);
  await writeAudit(me, 'update', 'user', user.id, user.fullName, `Переключение на организацию «${target.name}»`, c.req.header('x-forwarded-for'));

  return c.json({ token, user: publicUser(user) });
});

// Сохранение выбора темы оформления в БД (light | dark | system)
app.patch('/api/users/me/theme', authMiddleware, async (c) => {
  const currentUser = c.get('user');
  const parsed = z.object({ theme: z.enum(['light', 'dark', 'system']) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }
  const user = await prisma.user.update({
    where: { id: currentUser.userId },
    data: { theme: parsed.data.theme },
  });
  return c.json(publicUser(user));
});

// ============================================================
// Users Routes
// ============================================================
app.get('/api/users', authMiddleware, async (c) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return c.json(users.map(publicUser));
});

app.get('/api/users/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  if (currentUser.role !== 'admin' && currentUser.userId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json(publicUser(user));
});

app.get('/api/users/:id/history', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  if (currentUser.role !== 'admin' && currentUser.userId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'user', entityId: id },
    orderBy: { createdAt: 'asc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/users', authMiddleware, requireRole(['admin']), async (c) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2),
    role: z.enum(['admin', 'materially_responsible', 'viewer']),
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
  if (typeof body.fullName === 'string' && body.fullName.trim().length >= 2) updateData.fullName = body.fullName.trim();
  if (typeof body.email === 'string' && z.string().email().safeParse(body.email).success) {
    if (body.email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email: body.email } });
      if (clash) return c.json({ error: 'Email уже занят' }, 400);
    }
    updateData.email = body.email;
  }
  if (typeof body.avatar === 'string' || body.avatar === null) updateData.avatar = body.avatar;
  if (body.theme !== undefined) {
    const t = z.enum(['light', 'dark', 'system']).safeParse(body.theme);
    if (t.success) updateData.theme = t.data;
  }
  // Привилегированные поля — только для администратора
  if (isAdmin) {
    if (body.role !== undefined) {
      const r = z.enum(['admin', 'materially_responsible', 'viewer']).safeParse(body.role);
      if (r.success) updateData.role = r.data;
    }
    if (body.isActive !== undefined) updateData.isActive = !!body.isActive;
    if (body.organizationId !== undefined) {
      if (body.organizationId === null) {
        updateData.organizationId = null;
      } else {
        const foundOrg = typeof body.organizationId === 'string'
          ? await prisma.organization.findUnique({ where: { id: body.organizationId }, select: { id: true } })
          : null;
        updateData.organizationId = foundOrg ? foundOrg.id : target.organizationId;
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

  // История: без значения пароля
  const safeOld: Record<string, any> = { ...target };
  delete safeOld.password;
  const safeNew: Record<string, any> = { ...updateData };
  if ('password' in safeNew) {
    delete safeNew.password;
    await prisma.historyRecord.create({
      data: { entityType: 'user', entityId: id, action: 'updated', fieldName: 'пароль', changedBy: currentUser.fullName },
    });
  }
  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'user',
    entityId: id,
    entityName: user.fullName,
    oldObj: safeOld,
    newData: safeNew,
  });

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
  legalAddress: orgText,       // юридический адрес необязателен
  actualAddress: orgText,
  postalCode: orgText,
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

app.get('/api/organizations/:id', authMiddleware, async (c) => {
  const org = await prisma.organization.findUnique({ where: { id: c.req.param('id') } });
  if (!org) return c.json({ error: 'Not found' }, 404);
  return c.json(publicOrganization(org));
});

app.get('/api/organizations/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'organization', entityId: c.req.param('id') },
    orderBy: { createdAt: 'asc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/organizations', authMiddleware, requireRole(['admin']), async (c) => {
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

  // Создавший переключается на новую организацию; пользователи без организации
  // привязываются к ней (первичная инициализация системы).
  await prisma.user.update({ where: { id: currentUser.userId }, data: { organizationId: org.id } });
  await prisma.user.updateMany({ where: { organizationId: null }, data: { organizationId: org.id } });

  const updatedMe = await prisma.user.findUnique({ where: { id: currentUser.userId } });
  const token = await issueToken(updatedMe);

  return c.json({ ...publicOrganization(org), token, user: publicUser(updatedMe) }, 201);
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

  const linkedUsers = await prisma.user.count({ where: { organizationId: id } });
  if (linkedUsers > 0) {
    return c.json({ error: 'От организации отвязаны не все пользователи' }, 400);
  }

  // Данные организации (сотрудники/оборудование/ВМ) должны быть удалены или
  // перенесены заранее — иначе PostgreSQL заблокирует удаление FK-связями.
  const [empCount, eqCount, vmCount] = await Promise.all([
    prisma.employee.count({ where: { organizationId: id } }),
    prisma.equipment.count({ where: { organizationId: id } }),
    prisma.virtualMachine.count({ where: { organizationId: id } }),
  ]);
  if (empCount + eqCount + vmCount > 0) {
    return c.json({
      error: `В организации есть данные: сотрудников ${empCount}, оборудования ${eqCount}, ВМ ${vmCount}. Сначала удалите их.`,
    }, 409);
  }

  await prisma.historyRecord.deleteMany({ where: { entityType: 'organization', entityId: id } });
  await prisma.organization.delete({ where: { id } });
  await writeAudit(currentUser, 'delete', 'organization', id, org.name, `Удалена организация "${org.name}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
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
    createdAt: isoDate(e.createdAt),
    updatedAt: isoDate(e.updatedAt),
    position: e.position ? { id: e.position.id, name: e.position.name } : undefined,
    department: e.department ? { id: e.department.id, name: e.department.name } : undefined,
    branch: e.branch ? { id: e.branch.id, name: e.branch.name } : undefined,
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
  if ('branch' in out && out.branch) out.branch = { id: out.branch.id, name: out.branch.name };
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
    networkInterfaces: (vm.networkInterfaces || []).map((ni: any) => ({ ...ni, createdAt: isoDate(ni.createdAt), updatedAt: isoDate(ni.updatedAt) })),
    services: (vm.services || []).map((sv: any) => ({ ...sv, createdAt: isoDate(sv.createdAt), updatedAt: isoDate(sv.updatedAt) })),
  };
}

const employeeInclude = { position: true, department: true, branch: true, equipment: true } as const;

app.get('/api/employees', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const where: any = {};
  if (scope.orgId) where.organizationId = scope.orgId; else where.organizationId = null;
  const employees = await prisma.employee.findMany({ where, include: employeeInclude, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  return c.json(employees.map(publicEmployee));
});

app.get('/api/employees/:id', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const employee = await prisma.employee.findUnique({ where: { id: c.req.param('id') }, include: employeeInclude });
  if (!employee) return c.json({ error: 'Not found' }, 404);
  // Мультиорганизационность: чужую организацию не показываем (админу — все)
  if (employee.organizationId && employee.organizationId !== scope.orgId && scope.role !== 'admin') {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }
  return c.json(publicEmployee(employee));
});

app.get('/api/employees/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'employee', entityId: c.req.param('id') },
    orderBy: { createdAt: 'asc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/employees', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const parsed = employeeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные сотрудника' }, 400);
  }
  const currentUser = c.get('user');
  const data = parsed.data;
  const scope = await getUserOrgScope(currentUser.userId);

  // Справочники должны принадлежать активной организации (или быть общими)
  const positionId = await resolveRef('position', data.positionId, scope.orgId);
  const departmentId = await resolveRef('department', data.departmentId, scope.orgId);
  // Филиал необязателен: пустое/некорректное значение => null (сотрудник без филиала)
  const branchId = await resolveRefOrNull('branch', data.branchId ?? undefined, scope.orgId) ?? null;
  if (!positionId || !departmentId) {
    return c.json({ error: 'Справочники (должность/отдел) выбраны некорректно' }, 400);
  }

  const employee = await prisma.employee.create({
    data: {
      organizationId: scope.orgId,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName ?? null,
      email: data.email ?? null,
      workPhone: data.workPhone ?? null,
      internalPhone: data.internalPhone ?? null,
      personalPhone: data.personalPhone ?? null,
      hireDate: data.hireDate,
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

  return c.json(publicEmployee(employee), 201);
});

app.put('/api/employees/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
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
  if ('positionId' in newData) newData.positionId = await resolveRef('position', newData.positionId, scope.orgId) ?? old.positionId;
  if ('departmentId' in newData) newData.departmentId = await resolveRef('department', newData.departmentId, scope.orgId) ?? old.departmentId;
  if ('branchId' in newData) newData.branchId = await resolveRefOrNull('branch', newData.branchId ?? undefined, scope.orgId) ?? null;
  newData.updatedById = currentUser.userId;

  const employee = await prisma.employee.update({ where: { id }, data: newData, include: employeeInclude });

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

app.delete('/api/employees/:id', authMiddleware, requireRole(['admin']), async (c) => {
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
const equipmentSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['computer', 'monitor', 'peripheral', 'furniture', 'server', 'virtual_machine', 'network', 'phone', 'other']),
  serialNumber: z.string().min(1),
  inventoryNumber: z.string().min(1),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  writeOffDate: z.coerce.date().optional().nullable(),
  condition: z.enum(['new', 'good', 'satisfactory', 'needs_repair', 'written_off']).optional(),
  assignedToEmployeeId: z.string().optional().nullable(),
  branchId: z.string().min(1),
  floor: z.string().optional().nullable(),
  room: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const equipmentInclude = { assignedToEmployee: true, branch: true } as const;

function normalizeDateField(v: any) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return v instanceof Date ? v : new Date(v);
}

app.get('/api/equipment', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const where: any = {};
  if (scope.orgId) where.organizationId = scope.orgId; else where.organizationId = null;
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
  return c.json(publicEquipmentBrief(item));
});

app.get('/api/equipment/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'equipment', entityId: c.req.param('id') },
    orderBy: { createdAt: 'asc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/equipment', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const parsed = equipmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные оборудования' }, 400);
  }
  const currentUser = c.get('user');
  const data = parsed.data;
  const scope = await getUserOrgScope(currentUser.userId);

  const branchId = await resolveRef('branch', data.branchId);
  if (!branchId) return c.json({ error: 'Филиал выбран некорректно' }, 400);
  const assignedToEmployeeId = await resolveRef('employee', data.assignedToEmployeeId);

  const duplicate = await prisma.equipment.findUnique({ where: { inventoryNumber: data.inventoryNumber } });
  if (duplicate) {
    return c.json({ error: 'Инвентарный номер уже используется' }, 409);
  }

  const item = await prisma.equipment.create({
    data: {
      organizationId: scope.orgId,
      name: data.name,
      category: data.category,
      serialNumber: data.serialNumber,
      inventoryNumber: data.inventoryNumber,
      brand: data.brand ?? null,
      model: data.model ?? null,
      condition: data.condition ?? 'good',
      floor: data.floor ?? null,
      room: data.room ?? null,
      notes: data.notes ?? null,
      branchId,
      assignedToEmployeeId,
      purchaseDate: normalizeDateField(data.purchaseDate),
      writeOffDate: normalizeDateField(data.writeOffDate),
      updatedById: currentUser.userId,
    },
    include: equipmentInclude,
  });

  await createHistoryEntry('equipment', item.id, currentUser.fullName);
  await writeAudit(currentUser, 'create', 'equipment', item.id, item.name, `Добавлено оборудование "${item.name}" (инв. ${item.inventoryNumber})`, c.req.header('x-forwarded-for'));

  return c.json(publicEquipmentBrief(item), 201);
});

app.put('/api/equipment/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const parsed = equipmentSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }
  const currentUser = c.get('user');

  const old = await prisma.equipment.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  const newData: any = { ...parsed.data };
  if ('branchId' in newData) newData.branchId = await resolveRef('branch', newData.branchId) ?? old.branchId;
  if ('assignedToEmployeeId' in newData) newData.assignedToEmployeeId = await resolveRef('employee', newData.assignedToEmployeeId);
  if ('purchaseDate' in newData) newData.purchaseDate = normalizeDateField(newData.purchaseDate);
  if ('writeOffDate' in newData) newData.writeOffDate = normalizeDateField(newData.writeOffDate);
  if ('inventoryNumber' in newData && newData.inventoryNumber !== old.inventoryNumber) {
    const dup = await prisma.equipment.findUnique({ where: { inventoryNumber: newData.inventoryNumber } });
    if (dup) return c.json({ error: 'Инвентарный номер уже используется' }, 409);
  }
  newData.updatedById = currentUser.userId;

  const item = await prisma.equipment.update({ where: { id }, data: newData, include: equipmentInclude });

  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'equipment',
    entityId: id,
    entityName: item.name,
    oldObj: old as any,
    newData,
  });

  return c.json(publicEquipmentBrief(item));
});

app.delete('/api/equipment/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.equipment.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);
  const scope = await getUserOrgScope(currentUser.userId);
  if (old.organizationId && old.organizationId !== scope.orgId) {
    return c.json({ error: 'Нет доступа к этой организации' }, 403);
  }

  await prisma.equipment.delete({ where: { id } });
  await writeAudit(currentUser, 'delete', 'equipment', id, old.name, `Удалено оборудование "${old.name}" (инв. ${old.inventoryNumber})`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// Assign / unassign equipment to employee
app.post('/api/equipment/:id/assign', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
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

app.post('/api/equipment/:id/unassign', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
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
  name: z.string().min(1),
  hostname: z.string().min(1),
  type: z.enum(['virtual', 'container', 'cloud']).optional(),
  hostServerId: z.string().optional().nullable(),
  os: z.string().optional().nullable(),
  cpuCores: z.number().int().min(0).optional(),
  ramGB: z.number().int().min(0).optional(),
  diskGB: z.number().int().min(0).optional(),
  responsibleEmployeeId: z.string().optional().nullable(),
  serviceResponsibleEmployeeId: z.string().optional().nullable(),
  status: z.enum(['running', 'stopped', 'maintenance', 'decommissioned']).optional(),
  notes: z.string().optional().nullable(),
});

const vmInclude = {
  hostServer: true,
  responsibleEmployee: true,
  serviceResponsibleEmployee: true,
  networkInterfaces: true,
  services: true,
} as const;

app.get('/api/virtual-machines', authMiddleware, async (c) => {
  const scope = await getUserOrgScope(c.get('user').userId);
  const where: any = {};
  if (scope.orgId) where.organizationId = scope.orgId; else where.organizationId = null;
  const vms = await prisma.virtualMachine.findMany({ where, include: vmInclude, orderBy: { createdAt: 'desc' } });
  return c.json(vms.map(publicVM));
});

app.get('/api/virtual-machines/:id', authMiddleware, async (c) => {
  const vm = await prisma.virtualMachine.findUnique({ where: { id: c.req.param('id') }, include: vmInclude });
  if (!vm) return c.json({ error: 'Not found' }, 404);
  return c.json(publicVM(vm));
});

app.get('/api/virtual-machines/:id/history', authMiddleware, async (c) => {
  const history = await prisma.historyRecord.findMany({
    where: { entityType: 'virtualmachine', entityId: c.req.param('id') },
    orderBy: { createdAt: 'asc' },
  });
  return c.json(history.map(publicHistory));
});

app.post('/api/virtual-machines', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const parsed = vmSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные ВМ' }, 400);
  }
  const currentUser = c.get('user');
  const data = parsed.data;
  const scope = await getUserOrgScope(currentUser.userId);

  const hostServerId = await resolveRef('equipment', data.hostServerId);
  const responsibleEmployeeId = await resolveRef('employee', data.responsibleEmployeeId);
  const serviceResponsibleEmployeeId = await resolveRef('employee', data.serviceResponsibleEmployeeId);

  const vm = await prisma.virtualMachine.create({
    data: {
      organizationId: scope.orgId,
      name: data.name,
      hostname: data.hostname,
      type: data.type ?? 'virtual',
      os: data.os ?? null,
      status: data.status ?? 'running',
      notes: data.notes ?? null,
      cpuCores: data.cpuCores ?? 2,
      ramGB: data.ramGB ?? 4,
      diskGB: data.diskGB ?? 50,
      hostServerId,
      responsibleEmployeeId,
      serviceResponsibleEmployeeId,
      updatedById: currentUser.userId,
    },
    include: vmInclude,
  });

  await createHistoryEntry('virtualmachine', vm.id, currentUser.fullName);
  await writeAudit(currentUser, 'create', 'virtualmachine', vm.id, vm.name, `Добавлена ВМ "${vm.name}" (${vm.hostname})`, c.req.header('x-forwarded-for'));

  return c.json(publicVM(vm), 201);
});

app.put('/api/virtual-machines/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const parsed = vmSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Некорректные данные' }, 400);
  }
  const currentUser = c.get('user');

  const old = await prisma.virtualMachine.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  const newData: any = { ...parsed.data };
  if ('hostServerId' in newData) newData.hostServerId = await resolveRef('equipment', newData.hostServerId);
  if ('responsibleEmployeeId' in newData) newData.responsibleEmployeeId = await resolveRef('employee', newData.responsibleEmployeeId);
  if ('serviceResponsibleEmployeeId' in newData) newData.serviceResponsibleEmployeeId = await resolveRef('employee', newData.serviceResponsibleEmployeeId);
  newData.updatedById = currentUser.userId;

  const vm = await prisma.virtualMachine.update({ where: { id }, data: newData, include: vmInclude });

  await applyUpdate({
    ctx: currentUser,
    ipAddress: c.req.header('x-forwarded-for'),
    entityType: 'virtualmachine',
    entityId: id,
    entityName: vm.name,
    oldObj: old as any,
    newData,
  });

  return c.json(publicVM(vm));
});

app.delete('/api/virtual-machines/:id', authMiddleware, requireRole(['admin']), async (c) => {
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
app.post('/api/virtual-machines/:vmId/network-interfaces', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
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

  await writeAudit(currentUser, 'create', 'virtualmachine', vmId, vm.name, `Добавлен сетевой интерфейс "${ni.name}" (${ni.ipAddress})`, c.req.header('x-forwarded-for'));
  return c.json(ni, 201);
});

app.put('/api/network-interfaces/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
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

  await writeAudit(currentUser, 'update', 'virtualmachine', old.virtualMachineId, '', `Изменён сетевой интерфейс "${ni.name}"`, c.req.header('x-forwarded-for'));
  return c.json(ni);
});

app.delete('/api/network-interfaces/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.networkInterface.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  await prisma.networkInterface.delete({ where: { id } });
  await writeAudit(currentUser, 'delete', 'virtualmachine', old.virtualMachineId, '', `Удалён сетевой интерфейс "${old.name}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// Services on VMs
app.post('/api/virtual-machines/:vmId/services', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { vmId } = c.req.param();
  const parsed = z.object({
    name: z.string().min(1),
    version: z.string().optional().nullable(),
    port: z.number().int().min(1).max(65535).nullable().optional(),
    description: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive', 'maintenance']).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные сервиса' }, 400);

  const currentUser = c.get('user');
  const vm = await prisma.virtualMachine.findUnique({ where: { id: vmId } });
  if (!vm) return c.json({ error: 'ВМ не найдена' }, 404);

  const service = await prisma.service.create({
    data: {
      name: parsed.data.name,
      version: parsed.data.version ?? null,
      port: parsed.data.port ?? null,
      description: parsed.data.description ?? null,
      status: parsed.data.status ?? 'active',
      virtualMachineId: vmId,
      updatedById: currentUser.userId ?? undefined,
    },
  });

  await writeAudit(currentUser, 'create', 'virtualmachine', vmId, vm.name, `Добавлен сервис "${service.name}"`, c.req.header('x-forwarded-for'));
  return c.json(service, 201);
});

app.put('/api/services/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const parsed = z.object({
    name: z.string().min(1).optional(),
    version: z.string().optional().nullable(),
    port: z.number().int().min(1).max(65535).nullable().optional(),
    description: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive', 'maintenance']).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные' }, 400);

  const currentUser = c.get('user');
  const old = await prisma.service.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  const service = await prisma.service.update({
    where: { id },
    data: { ...parsed.data, updatedById: currentUser.userId ?? undefined },
  });

  await writeAudit(currentUser, 'update', 'virtualmachine', old.virtualMachineId, '', `Изменён сервис "${service.name}"`, c.req.header('x-forwarded-for'));
  return c.json(service);
});

app.delete('/api/services/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const old = await prisma.service.findUnique({ where: { id } });
  if (!old) return c.json({ error: 'Not found' }, 404);

  await prisma.service.delete({ where: { id } });
  await writeAudit(currentUser, 'delete', 'virtualmachine', old.virtualMachineId, '', `Удалён сервис "${old.name}"`, c.req.header('x-forwarded-for'));
  return c.json({ success: true });
});

// ============================================================
// Directories Routes (Departments, Positions, Branches)
// ============================================================
interface DirConfig {
  model: 'department' | 'position' | 'branch';
  route: string;
  label: string;
  requiredBranchAddress?: boolean;
}

const directoryConfigs: DirConfig[] = [
  { model: 'department', route: 'departments', label: 'Отдел' },
  { model: 'position', route: 'positions', label: 'Должность' },
  { model: 'branch', route: 'branches', label: 'Филиал' },
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

// ============================================================
// Chlenix Backend API — Main Entry Point
// Node.js 22 + Hono + Prisma + PostgreSQL
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
    };
  };
};

// ============================================================
// Инициализация
// ============================================================
const app = new Hono<Env>();
const prisma = new PrismaClient();

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW && process.env.NODE_ENV === 'production') {
  console.error('❌ Ошибка запуска: в production обязателен JWT_SECRET.');
  console.error('   Задайте его в .env (генерация: openssl rand -base64 48).');
  process.exit(1);
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || 'dev_only_secret_do_not_use_in_production');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost';

// ============================================================
// Middleware
// ============================================================
app.use('*', logger());
app.use('/api/*', cors({
  origin: CORS_ORIGIN,
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

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
  } catch (error) {
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
// Health Check
// ============================================================
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// Auth Routes
// ============================================================
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await new SignJWT({ 
    userId: user.id, 
    email: user.email, 
    role: user.role, 
    fullName: user.fullName 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userName: user.fullName,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      entityName: user.fullName,
      details: 'User logged in',
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    },
  });

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
  });
});

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2),
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  const { email, password, fullName } = result.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return c.json({ error: 'Пользователь с таким email уже существует' }, 400);
  }

  // Первый зарегистрированный пользователь — администратор организации
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? 'admin' : 'viewer';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, password: passwordHash, fullName, role },
  });

  const token = await new SignJWT({ 
    userId: user.id, 
    email: user.email, 
    role: user.role, 
    fullName: user.fullName 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
  });
});

// ============================================================
// Users Routes
// ============================================================
app.get('/api/users', authMiddleware, async (c) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(users);
});

app.post('/api/users', authMiddleware, requireRole(['admin']), async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2),
    role: z.enum(['admin', 'materially_responsible', 'viewer']),
    isActive: z.boolean().optional(),
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  const { email, password, fullName, role, isActive } = result.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const currentUser = c.get('user');

  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      fullName,
      role,
      isActive: isActive ?? true,
      updatedById: currentUser.userId,
    },
  });

  return c.json(user, 201);
});

app.put('/api/users/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const currentUser = c.get('user');
  const body = await c.req.json();

  // Пользователь может редактировать только себя, админ — всех
  if (currentUser.role !== 'admin' && currentUser.userId !== id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const updateData: any = {};
  if (body.fullName) updateData.fullName = body.fullName;
  if (body.email) updateData.email = body.email;
  if (body.role && currentUser.role === 'admin') updateData.role = body.role;
  if (body.isActive !== undefined && currentUser.role === 'admin') updateData.isActive = body.isActive;
  if (body.password) updateData.password = await bcrypt.hash(body.password, 12);
  updateData.updatedById = currentUser.userId;

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
  });

  return c.json(user);
});

app.delete('/api/users/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.user.delete({ where: { id } });
  return c.json({ success: true });
});

// ============================================================
// Employees Routes
// ============================================================
app.get('/api/employees', authMiddleware, async (c) => {
  const employees = await prisma.employee.findMany({
    include: {
      position: true,
      department: true,
      branch: true,
    },
    orderBy: { lastName: 'asc' },
  });
  return c.json(employees);
});

app.get('/api/employees/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      position: true,
      department: true,
      branch: true,
      equipment: true,
    },
  });
  if (!employee) return c.json({ error: 'Not found' }, 404);
  return c.json(employee);
});

app.post('/api/employees', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const body = await c.req.json();
  const currentUser = c.get('user');

  const employee = await prisma.employee.create({
    data: {
      ...body,
      hireDate: new Date(body.hireDate),
      updatedById: currentUser.userId,
    },
    include: { position: true, department: true, branch: true },
  });

  return c.json(employee, 201);
});

app.put('/api/employees/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...body,
      hireDate: body.hireDate ? new Date(body.hireDate) : undefined,
      updatedById: currentUser.userId,
    },
    include: { position: true, department: true, branch: true },
  });

  return c.json(employee);
});

app.delete('/api/employees/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.employee.delete({ where: { id } });
  return c.json({ success: true });
});

// ============================================================
// Equipment Routes
// ============================================================
app.get('/api/equipment', authMiddleware, async (c) => {
  const equipment = await prisma.equipment.findMany({
    include: {
      assignedToEmployee: true,
      branch: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(equipment);
});

app.post('/api/equipment', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const body = await c.req.json();
  const currentUser = c.get('user');

  const equipment = await prisma.equipment.create({
    data: {
      ...body,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
      writeOffDate: body.writeOffDate ? new Date(body.writeOffDate) : null,
      updatedById: currentUser.userId,
    },
    include: { assignedToEmployee: true, branch: true },
  });

  return c.json(equipment, 201);
});

app.put('/api/equipment/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');

  const equipment = await prisma.equipment.update({
    where: { id },
    data: {
      ...body,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
      writeOffDate: body.writeOffDate ? new Date(body.writeOffDate) : null,
      updatedById: currentUser.userId,
    },
    include: { assignedToEmployee: true, branch: true },
  });

  return c.json(equipment);
});

app.delete('/api/equipment/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.equipment.delete({ where: { id } });
  return c.json({ success: true });
});

// ============================================================
// Virtual Machines Routes
// ============================================================
app.get('/api/virtual-machines', authMiddleware, async (c) => {
  const vms = await prisma.virtualMachine.findMany({
    include: {
      hostServer: true,
      responsibleEmployee: true,
      serviceResponsibleEmployee: true,
      networkInterfaces: true,
      services: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(vms);
});

app.get('/api/virtual-machines/:id', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const vm = await prisma.virtualMachine.findUnique({
    where: { id },
    include: {
      hostServer: true,
      responsibleEmployee: true,
      serviceResponsibleEmployee: true,
      networkInterfaces: true,
      services: true,
    },
  });
  if (!vm) return c.json({ error: 'Not found' }, 404);
  return c.json(vm);
});

app.post('/api/virtual-machines', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const body = await c.req.json();
  const currentUser = c.get('user');

  const vm = await prisma.virtualMachine.create({
    data: {
      ...body,
      hostServerId: body.hostServerId || null,
      responsibleEmployeeId: body.responsibleEmployeeId || null,
      serviceResponsibleEmployeeId: body.serviceResponsibleEmployeeId || null,
      updatedById: currentUser.userId,
    },
    include: {
      hostServer: true,
      responsibleEmployee: true,
      serviceResponsibleEmployee: true,
      networkInterfaces: true,
      services: true,
    },
  });

  return c.json(vm, 201);
});

app.put('/api/virtual-machines/:id', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');

  const vm = await prisma.virtualMachine.update({
    where: { id },
    data: {
      ...body,
      updatedById: currentUser.userId,
    },
    include: {
      hostServer: true,
      responsibleEmployee: true,
      serviceResponsibleEmployee: true,
      networkInterfaces: true,
      services: true,
    },
  });

  return c.json(vm);
});

app.delete('/api/virtual-machines/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.virtualMachine.delete({ where: { id } });
  return c.json({ success: true });
});

// Network Interfaces
app.post('/api/virtual-machines/:vmId/network-interfaces', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { vmId } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');

  const ni = await prisma.networkInterface.create({
    data: {
      ...body,
      virtualMachineId: vmId,
      updatedById: currentUser.userId,
    },
  });

  return c.json(ni, 201);
});

app.delete('/api/network-interfaces/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.networkInterface.delete({ where: { id } });
  return c.json({ success: true });
});

// Services
app.post('/api/virtual-machines/:vmId/services', authMiddleware, requireRole(['admin', 'materially_responsible']), async (c) => {
  const { vmId } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');

  const service = await prisma.service.create({
    data: {
      ...body,
      virtualMachineId: vmId,
      updatedById: currentUser.userId,
    },
  });

  return c.json(service, 201);
});

app.delete('/api/services/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.service.delete({ where: { id } });
  return c.json({ success: true });
});

// ============================================================
// Directories Routes (Departments, Positions, Branches)
// ============================================================
app.get('/api/departments', authMiddleware, async (c) => {
  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  return c.json(departments);
});

app.post('/api/departments', authMiddleware, requireRole(['admin']), async (c) => {
  const body = await c.req.json();
  const currentUser = c.get('user');
  const department = await prisma.department.create({
    data: { ...body, updatedById: currentUser.userId },
  });
  return c.json(department, 201);
});

app.put('/api/departments/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');
  const department = await prisma.department.update({
    where: { id },
    data: { ...body, updatedById: currentUser.userId },
  });
  return c.json(department);
});

app.delete('/api/departments/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.department.delete({ where: { id } });
  return c.json({ success: true });
});

app.get('/api/positions', authMiddleware, async (c) => {
  const positions = await prisma.position.findMany({ orderBy: { name: 'asc' } });
  return c.json(positions);
});

app.post('/api/positions', authMiddleware, requireRole(['admin']), async (c) => {
  const body = await c.req.json();
  const currentUser = c.get('user');
  const position = await prisma.position.create({
    data: { ...body, updatedById: currentUser.userId },
  });
  return c.json(position, 201);
});

app.put('/api/positions/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');
  const position = await prisma.position.update({
    where: { id },
    data: { ...body, updatedById: currentUser.userId },
  });
  return c.json(position);
});

app.delete('/api/positions/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.position.delete({ where: { id } });
  return c.json({ success: true });
});

app.get('/api/branches', authMiddleware, async (c) => {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  return c.json(branches);
});

app.post('/api/branches', authMiddleware, requireRole(['admin']), async (c) => {
  const body = await c.req.json();
  const currentUser = c.get('user');
  const branch = await prisma.branch.create({
    data: { ...body, updatedById: currentUser.userId },
  });
  return c.json(branch, 201);
});

app.put('/api/branches/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const currentUser = c.get('user');
  const branch = await prisma.branch.update({
    where: { id },
    data: { ...body, updatedById: currentUser.userId },
  });
  return c.json(branch);
});

app.delete('/api/branches/:id', authMiddleware, requireRole(['admin']), async (c) => {
  const { id } = c.req.param();
  await prisma.branch.delete({ where: { id } });
  return c.json({ success: true });
});

// ============================================================
// Audit Log
// ============================================================
app.get('/api/audit-logs', authMiddleware, requireRole(['admin']), async (c) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
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
const PORT = parseInt(process.env.PORT || '4000');

async function start() {
  try {
    await prisma.$connect();
    console.log('✓ Connected to PostgreSQL');

    serve({
      fetch: app.fetch,
      port: PORT,
    });

    console.log(`✓ Chlenix Backend API running on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

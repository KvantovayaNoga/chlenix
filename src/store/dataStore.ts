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

// Справочники
const initialDepartments: Department[] = [
  { id: 'd1', name: 'IT-отдел', description: 'Информационные технологии', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'd2', name: 'Бухгалтерия', description: 'Бухгалтерский учёт и отчётность', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'd3', name: 'Отдел продаж', description: 'Продажи и работа с клиентами', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'd4', name: 'Отдел маркетинга', description: 'Маркетинг и реклама', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'd5', name: 'Отдел кадров', description: 'Управление персоналом', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'd6', name: 'Руководство', description: 'Руководство организации', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
];

const initialPositions: Position[] = [
  { id: 'p1', name: 'Ведущий разработчик', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p2', name: 'Бухгалтер', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p3', name: 'Системный администратор', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p4', name: 'Менеджер по продажам', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p5', name: 'Дизайнер', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p6', name: 'HR-менеджер', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p7', name: 'Директор', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p8', name: 'Секретарь', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p9', name: 'DevOps-инженер', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'p10', name: 'Backend-разработчик', description: '', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
];

const initialBranches: Branch[] = [
  { id: 'b1', name: 'Главный офис', address: 'г. Москва, ул. Ленина, 1', description: 'Центральный офис компании', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'b2', name: 'Филиал Санкт-Петербург', address: 'г. Санкт-Петербург, Невский пр., 100', description: 'Северо-западный филиал', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
  { id: 'b3', name: 'Дата-центр', address: 'г. Москва, Промышленная зона, 5', description: 'Серверная инфраструктура', createdAt: '2024-01-01', updatedAt: now, updatedBy: null },
];

// Сотрудники
const initialEmployees: Employee[] = [
  { id: '1', firstName: 'Алексей', lastName: 'Смирнов', middleName: 'Петрович', positionId: 'p1', departmentId: 'd1', email: 'smirnov@company.ru', workPhone: '+7 (495) 123-45-67', internalPhone: '1001', personalPhone: '+7 (999) 123-45-67', hireDate: '2020-03-15', isEmployed: true, branchId: 'b1', floor: '3', room: '301', notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '2', firstName: 'Мария', lastName: 'Козлова', middleName: 'Александровна', positionId: 'p2', departmentId: 'd2', email: 'kozlova@company.ru', workPhone: '+7 (495) 234-56-78', internalPhone: '2001', personalPhone: '+7 (999) 234-56-78', hireDate: '2019-07-01', isEmployed: true, branchId: 'b1', floor: '2', room: '205', notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '3', firstName: 'Дмитрий', lastName: 'Волков', middleName: 'Сергеевич', positionId: 'p3', departmentId: 'd1', email: 'volkov@company.ru', workPhone: '+7 (495) 345-67-89', internalPhone: '1002', personalPhone: '+7 (999) 345-67-89', hireDate: '2021-01-10', isEmployed: true, branchId: 'b3', floor: '', room: 'Серверная', notes: 'Ответственный за серверное оборудование', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '4', firstName: 'Елена', lastName: 'Новикова', middleName: 'Игоревна', positionId: 'p4', departmentId: 'd3', email: 'novikova@company.ru', workPhone: '+7 (495) 456-78-90', internalPhone: '3001', personalPhone: '+7 (999) 456-78-90', hireDate: '2022-05-20', isEmployed: true, branchId: 'b1', floor: '1', room: '102', notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '5', firstName: 'Игорь', lastName: 'Морозов', middleName: 'Владимирович', positionId: 'p5', departmentId: 'd4', email: 'morozov@company.ru', workPhone: '+7 (495) 567-89-01', internalPhone: '4001', personalPhone: '+7 (999) 567-89-01', hireDate: '2023-02-14', isEmployed: true, branchId: 'b1', floor: '3', room: '303', notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '6', firstName: 'Ольга', lastName: 'Соколова', middleName: 'Дмитриевна', positionId: 'p6', departmentId: 'd5', email: 'sokolova@company.ru', workPhone: '+7 (495) 678-90-12', internalPhone: '5001', personalPhone: '+7 (999) 678-90-12', hireDate: '2021-09-01', isEmployed: true, branchId: 'b1', floor: '2', room: '201', notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '7', firstName: 'Андрей', lastName: 'Лебедев', middleName: 'Николаевич', positionId: 'p7', departmentId: 'd6', email: 'lebedev@company.ru', workPhone: '+7 (495) 789-01-23', internalPhone: '6001', personalPhone: '+7 (999) 789-01-23', hireDate: '2018-01-15', isEmployed: true, branchId: 'b1', floor: '4', room: '401', notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '8', firstName: 'Наталья', lastName: 'Кузнецова', middleName: 'Андреевна', positionId: 'p8', departmentId: 'd6', email: 'kuznetsova@company.ru', workPhone: '+7 (495) 890-12-34', internalPhone: '6002', personalPhone: '+7 (999) 890-12-34', hireDate: '2020-11-01', isEmployed: false, branchId: 'b1', floor: '1', room: '101', notes: 'Уволена 15.12.2024', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '9', firstName: 'Павел', lastName: 'Куликов', middleName: 'Олегович', positionId: 'p9', departmentId: 'd1', email: 'kulikov@company.ru', workPhone: '+7 (495) 901-23-45', internalPhone: '1003', personalPhone: '+7 (999) 901-23-45', hireDate: '2022-03-01', isEmployed: true, branchId: 'b1', floor: '3', room: '302', notes: 'Ответственный за сервисы и middleware', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: '10', firstName: 'Сергей', lastName: 'Зайцев', middleName: 'Александрович', positionId: 'p10', departmentId: 'd1', email: 'zaytsev@company.ru', workPhone: '+7 (495) 012-34-56', internalPhone: '1004', personalPhone: '+7 (999) 012-34-56', hireDate: '2023-06-15', isEmployed: true, branchId: 'b1', floor: '3', room: '302', notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
];

// Оборудование
const initialEquipment: Equipment[] = [
  { id: '1', name: 'Ноутбук Dell Latitude 5540', category: 'computer', serialNumber: 'DL5540-2024-001', inventoryNumber: 'INV-PC-001', brand: 'Dell', model: 'Latitude 5540', purchaseDate: '2024-01-15', writeOffDate: null, condition: 'good', assignedToEmployeeId: '1', branchId: 'b1', floor: '3', room: '301', cpuCores: null, ramGB: null, diskGB: null, notes: 'i7, 32GB RAM, 512GB SSD', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: '2', name: 'Монитор Dell U2723QE', category: 'monitor', serialNumber: 'DU2723-2024-002', inventoryNumber: 'INV-MON-001', brand: 'Dell', model: 'U2723QE', purchaseDate: '2024-01-15', writeOffDate: null, condition: 'good', assignedToEmployeeId: '1', branchId: 'b1', floor: '3', room: '301', cpuCores: null, ramGB: null, diskGB: null, notes: '27" 4K IPS', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: '3', name: 'ПК HP ProDesk 400 G9', category: 'computer', serialNumber: 'HP400G9-2023-003', inventoryNumber: 'INV-PC-002', brand: 'HP', model: 'ProDesk 400 G9', purchaseDate: '2023-06-01', writeOffDate: null, condition: 'good', assignedToEmployeeId: '2', branchId: 'b1', floor: '2', room: '205', cpuCores: null, ramGB: null, diskGB: null, notes: 'i5, 16GB RAM, 256GB SSD', createdAt: '2023-06-01', updatedAt: now, updatedBy: null },
  { id: '4', name: 'Монитор LG 24MK430H', category: 'monitor', serialNumber: 'LG24MK-2023-004', inventoryNumber: 'INV-MON-002', brand: 'LG', model: '24MK430H', purchaseDate: '2023-06-01', writeOffDate: null, condition: 'good', assignedToEmployeeId: '2', branchId: 'b1', floor: '2', room: '205', cpuCores: null, ramGB: null, diskGB: null, notes: '24" Full HD IPS', createdAt: '2023-06-01', updatedAt: now, updatedBy: null },
  { id: '5', name: 'Сервер Dell PowerEdge R750', category: 'server', serialNumber: 'DPE-R750-2022-005', inventoryNumber: 'INV-SRV-001', brand: 'Dell', model: 'PowerEdge R750', purchaseDate: '2022-03-10', writeOffDate: null, condition: 'good', assignedToEmployeeId: '3', branchId: 'b3', floor: '', room: 'Серверная', cpuCores: 56, ramGB: 256, diskGB: 4000, notes: '2x Xeon Gold, 256GB ECC, 4x 1TB NVMe', createdAt: '2022-03-10', updatedAt: now, updatedBy: null },
  { id: '6', name: 'Коммутатор Cisco Catalyst 9300', category: 'network', serialNumber: 'CC9300-2022-006', inventoryNumber: 'INV-NET-001', brand: 'Cisco', model: 'Catalyst 9300', purchaseDate: '2022-03-10', writeOffDate: null, condition: 'good', assignedToEmployeeId: '3', branchId: 'b3', floor: '', room: 'Серверная', cpuCores: null, ramGB: null, diskGB: null, notes: '48 портов PoE+', createdAt: '2022-03-10', updatedAt: now, updatedBy: null },
  { id: '7', name: 'Стол офисный Бюрократ', category: 'furniture', serialNumber: 'N/A', inventoryNumber: 'INV-FUR-001', brand: 'Бюрократ', model: 'Director-1', purchaseDate: '2020-01-10', writeOffDate: null, condition: 'satisfactory', assignedToEmployeeId: '1', branchId: 'b1', floor: '3', room: '301', cpuCores: null, ramGB: null, diskGB: null, notes: '', createdAt: '2020-01-10', updatedAt: now, updatedBy: null },
  { id: '8', name: 'Кресло офисное Chairman', category: 'furniture', serialNumber: 'N/A', inventoryNumber: 'INV-FUR-002', brand: 'Chairman', model: '690', purchaseDate: '2020-01-10', writeOffDate: null, condition: 'good', assignedToEmployeeId: '1', branchId: 'b1', floor: '3', room: '301', cpuCores: null, ramGB: null, diskGB: null, notes: '', createdAt: '2020-01-10', updatedAt: now, updatedBy: null },
  { id: '9', name: 'MacBook Pro 16" M3 Pro', category: 'computer', serialNumber: 'MBP16-M3-2024-009', inventoryNumber: 'INV-PC-003', brand: 'Apple', model: 'MacBook Pro 16 M3 Pro', purchaseDate: '2024-02-01', writeOffDate: null, condition: 'new', assignedToEmployeeId: '5', branchId: 'b1', floor: '3', room: '303', cpuCores: null, ramGB: null, diskGB: null, notes: 'M3 Pro, 36GB, 1TB SSD', createdAt: '2024-02-01', updatedAt: now, updatedBy: null },
  { id: '10', name: 'Монитор Apple Studio Display', category: 'monitor', serialNumber: 'ASD-2024-010', inventoryNumber: 'INV-MON-003', brand: 'Apple', model: 'Studio Display', purchaseDate: '2024-02-01', writeOffDate: null, condition: 'new', assignedToEmployeeId: '5', branchId: 'b1', floor: '3', room: '303', cpuCores: null, ramGB: null, diskGB: null, notes: '27" 5K Retina', createdAt: '2024-02-01', updatedAt: now, updatedBy: null },
  { id: '11', name: 'Телефон Panasonic KX-T7730', category: 'phone', serialNumber: 'PAN-T7730-011', inventoryNumber: 'INV-PH-001', brand: 'Panasonic', model: 'KX-T7730', purchaseDate: '2019-05-01', writeOffDate: null, condition: 'satisfactory', assignedToEmployeeId: '7', branchId: 'b1', floor: '4', room: '401', cpuCores: null, ramGB: null, diskGB: null, notes: '', createdAt: '2019-05-01', updatedAt: now, updatedBy: null },
  { id: '12', name: 'Принтер HP LaserJet Pro M404dn', category: 'peripheral', serialNumber: 'HP-M404-2021-012', inventoryNumber: 'INV-PRN-001', brand: 'HP', model: 'LaserJet Pro M404dn', purchaseDate: '2021-08-15', writeOffDate: null, condition: 'needs_repair', assignedToEmployeeId: null, branchId: 'b1', floor: '2', room: 'Коридор', cpuCores: null, ramGB: null, diskGB: null, notes: 'Требуется замена термоплёнки', createdAt: '2021-08-15', updatedAt: now, updatedBy: null },
  { id: '13', name: 'Сервер HP ProLiant DL380 Gen10', category: 'server', serialNumber: 'HP-DL380-2021-013', inventoryNumber: 'INV-SRV-002', brand: 'HP', model: 'ProLiant DL380 Gen10', purchaseDate: '2021-06-01', writeOffDate: null, condition: 'good', assignedToEmployeeId: '3', branchId: 'b3', floor: '', room: 'Серверная', cpuCores: 32, ramGB: 128, diskGB: 2000, notes: '2x Xeon Silver, 128GB ECC, RAID5', createdAt: '2021-06-01', updatedAt: now, updatedBy: null },
  { id: '14', name: 'UPS APC Smart-UPS 3000', category: 'other', serialNumber: 'APC-3000-2022-014', inventoryNumber: 'INV-OTH-001', brand: 'APC', model: 'Smart-UPS 3000VA', purchaseDate: '2022-03-10', writeOffDate: null, condition: 'good', assignedToEmployeeId: '3', branchId: 'b3', floor: '', room: 'Серверная', cpuCores: null, ramGB: null, diskGB: null, notes: 'ИБП для серверного оборудования', createdAt: '2022-03-10', updatedAt: now, updatedBy: null },
];

// Виртуальные машины
const initialVMs: VirtualMachine[] = [
  { id: 'vm1', name: 'prod-web-01', hostname: 'web01.company.local', type: 'virtual', hostServerId: '5', os: 'Ubuntu 22.04 LTS', cpuCores: 4, ramGB: 8, diskGB: 100, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '9', networkInterfaces: [{ id: 'ni1', name: 'eth0', macAddress: '00:50:56:A1:01:01', ipAddress: '10.0.2.10', isPublic: false, notes: 'Основной интерфейс', createdAt: '2024-01-15', updatedAt: now, updatedBy: null }, { id: 'ni2', name: 'eth1', macAddress: '00:50:56:A1:01:02', ipAddress: '203.0.113.10', isPublic: true, notes: 'Белый IP для веб-сервера', createdAt: '2024-01-15', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Основной веб-сервер', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: 'vm2', name: 'prod-db-01', hostname: 'db01.company.local', type: 'virtual', hostServerId: '5', os: 'CentOS 8', cpuCores: 8, ramGB: 32, diskGB: 500, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '10', networkInterfaces: [{ id: 'ni3', name: 'eth0', macAddress: '00:50:56:A1:02:01', ipAddress: '10.0.2.20', isPublic: false, notes: '', createdAt: '2024-01-15', updatedAt: now, updatedBy: null }], status: 'running', notes: 'PostgreSQL основной сервер БД', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: 'vm3', name: 'prod-app-01', hostname: 'app01.company.local', type: 'virtual', hostServerId: '5', os: 'Ubuntu 22.04 LTS', cpuCores: 4, ramGB: 16, diskGB: 200, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '9', networkInterfaces: [{ id: 'ni4', name: 'eth0', macAddress: '00:50:56:A1:03:01', ipAddress: '10.0.2.30', isPublic: false, notes: '', createdAt: '2024-01-15', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Backend приложение Node.js', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: 'vm4', name: 'prod-redis-01', hostname: 'redis01.company.local', type: 'virtual', hostServerId: '13', os: 'Debian 12', cpuCores: 2, ramGB: 8, diskGB: 50, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '9', networkInterfaces: [{ id: 'ni5', name: 'eth0', macAddress: '00:50:56:A1:04:01', ipAddress: '10.0.2.40', isPublic: false, notes: '', createdAt: '2024-02-01', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Redis кластер', createdAt: '2024-02-01', updatedAt: now, updatedBy: null },
  { id: 'vm5', name: 'test-web-01', hostname: 'web-test.company.local', type: 'virtual', hostServerId: '13', os: 'Ubuntu 22.04 LTS', cpuCores: 2, ramGB: 4, diskGB: 50, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '10', networkInterfaces: [{ id: 'ni6', name: 'eth0', macAddress: '00:50:56:A1:05:01', ipAddress: '10.0.3.10', isPublic: false, notes: '', createdAt: '2024-03-01', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Тестовый веб-сервер', createdAt: '2024-03-01', updatedAt: now, updatedBy: null },
  { id: 'vm6', name: 'prod-monitoring', hostname: 'monitoring.company.local', type: 'virtual', hostServerId: '5', os: 'Ubuntu 22.04 LTS', cpuCores: 4, ramGB: 16, diskGB: 200, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '3', networkInterfaces: [{ id: 'ni7', name: 'eth0', macAddress: '00:50:56:A1:06:01', ipAddress: '10.0.2.50', isPublic: false, notes: 'Grafana/Prometheus сеть', createdAt: '2024-01-20', updatedAt: now, updatedBy: null }, { id: 'ni8', name: 'eth1', macAddress: '00:50:56:A1:06:02', ipAddress: '192.168.100.50', isPublic: false, notes: 'Сеть управления', createdAt: '2024-01-20', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Grafana + Prometheus + Alertmanager', createdAt: '2024-01-20', updatedAt: now, updatedBy: null },
  { id: 'vm7', name: 'prod-gitlab', hostname: 'gitlab.company.local', type: 'virtual', hostServerId: '13', os: 'Ubuntu 22.04 LTS', cpuCores: 8, ramGB: 16, diskGB: 500, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '10', networkInterfaces: [{ id: 'ni9', name: 'eth0', macAddress: '00:50:56:A1:07:01', ipAddress: '10.0.2.60', isPublic: false, notes: '', createdAt: '2024-02-15', updatedAt: now, updatedBy: null }, { id: 'ni10', name: 'eth1', macAddress: '00:50:56:A1:07:02', ipAddress: '203.0.113.60', isPublic: true, notes: 'Белый IP для GitLab', createdAt: '2024-02-15', updatedAt: now, updatedBy: null }], status: 'running', notes: 'GitLab CE + Runner', createdAt: '2024-02-15', updatedAt: now, updatedBy: null },
  { id: 'vm8', name: 'prod-mail', hostname: 'mail.company.local', type: 'virtual', hostServerId: '5', os: 'Debian 12', cpuCores: 2, ramGB: 4, diskGB: 100, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '9', networkInterfaces: [{ id: 'ni11', name: 'eth0', macAddress: '00:50:56:A1:08:01', ipAddress: '10.0.2.70', isPublic: false, notes: '', createdAt: '2024-01-25', updatedAt: now, updatedBy: null }, { id: 'ni12', name: 'eth1', macAddress: '00:50:56:A1:08:02', ipAddress: '203.0.113.70', isPublic: true, notes: 'MX запись', createdAt: '2024-01-25', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Postfix + Dovecot', createdAt: '2024-01-25', updatedAt: now, updatedBy: null },
  { id: 'vm9', name: 'dev-k8s-node-01', hostname: 'k8s-node01.company.local', type: 'virtual', hostServerId: '5', os: 'Ubuntu 22.04 LTS', cpuCores: 4, ramGB: 8, diskGB: 100, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '9', networkInterfaces: [{ id: 'ni13', name: 'eth0', macAddress: '00:50:56:A1:09:01', ipAddress: '10.0.3.20', isPublic: false, notes: 'Kubernetes worker node', createdAt: '2024-04-01', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Kubernetes worker', createdAt: '2024-04-01', updatedAt: now, updatedBy: null },
  { id: 'vm10', name: 'dev-k8s-node-02', hostname: 'k8s-node02.company.local', type: 'virtual', hostServerId: '13', os: 'Ubuntu 22.04 LTS', cpuCores: 4, ramGB: 8, diskGB: 100, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '9', networkInterfaces: [{ id: 'ni14', name: 'eth0', macAddress: '00:50:56:A1:10:01', ipAddress: '10.0.3.21', isPublic: false, notes: 'Kubernetes worker node', createdAt: '2024-04-01', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Kubernetes worker', createdAt: '2024-04-01', updatedAt: now, updatedBy: null },
  { id: 'vm11', name: 'prod-backup', hostname: 'backup.company.local', type: 'virtual', hostServerId: '13', os: 'Debian 12', cpuCores: 2, ramGB: 4, diskGB: 2000, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '3', networkInterfaces: [{ id: 'ni15', name: 'eth0', macAddress: '00:50:56:A1:11:01', ipAddress: '10.0.1.100', isPublic: false, notes: '', createdAt: '2024-01-10', updatedAt: now, updatedBy: null }], status: 'running', notes: 'Сервер резервного копирования', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
  { id: 'vm12', name: 'old-legacy-app', hostname: 'legacy.company.local', type: 'virtual', hostServerId: '13', os: 'CentOS 7', cpuCores: 2, ramGB: 4, diskGB: 50, responsibleEmployeeId: '3', serviceResponsibleEmployeeId: '10', networkInterfaces: [{ id: 'ni16', name: 'eth0', macAddress: '00:50:56:A1:12:01', ipAddress: '10.0.2.200', isPublic: false, notes: 'Планируется миграция', createdAt: '2023-01-01', updatedAt: now, updatedBy: null }], status: 'maintenance', notes: 'Устаревшее приложение, планируется вывод из эксплуатации', createdAt: '2023-01-01', updatedAt: now, updatedBy: null },
];

// Сервисы
const initialServices: Service[] = [
  { id: 'svc1', virtualMachineId: 'vm1', name: 'Nginx', version: '1.24.0', port: 80, description: 'Reverse proxy', status: 'active', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: 'svc2', virtualMachineId: 'vm1', name: 'Nginx (SSL)', version: '1.24.0', port: 443, description: 'HTTPS reverse proxy', status: 'active', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: 'svc3', virtualMachineId: 'vm2', name: 'PostgreSQL', version: '15.4', port: 5432, description: 'Основная БД', status: 'active', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: 'svc4', virtualMachineId: 'vm3', name: 'Node.js API', version: '20.10.0', port: 3000, description: 'Backend API сервер', status: 'active', createdAt: '2024-01-15', updatedAt: now, updatedBy: null },
  { id: 'svc5', virtualMachineId: 'vm4', name: 'Redis', version: '7.2.3', port: 6379, description: 'Кэш и сессии', status: 'active', createdAt: '2024-02-01', updatedAt: now, updatedBy: null },
  { id: 'svc6', virtualMachineId: 'vm6', name: 'Grafana', version: '10.2.3', port: 3000, description: 'Мониторинг', status: 'active', createdAt: '2024-01-20', updatedAt: now, updatedBy: null },
  { id: 'svc7', virtualMachineId: 'vm6', name: 'Prometheus', version: '2.48.1', port: 9090, description: 'Метрики', status: 'active', createdAt: '2024-01-20', updatedAt: now, updatedBy: null },
  { id: 'svc8', virtualMachineId: 'vm7', name: 'GitLab CE', version: '16.7.0', port: 80, description: 'Git репозитории', status: 'active', createdAt: '2024-02-15', updatedAt: now, updatedBy: null },
  { id: 'svc9', virtualMachineId: 'vm8', name: 'Postfix', version: '3.7.0', port: 25, description: 'SMTP сервер', status: 'active', createdAt: '2024-01-25', updatedAt: now, updatedBy: null },
  { id: 'svc10', virtualMachineId: 'vm8', name: 'Dovecot', version: '2.3.21', port: 993, description: 'IMAP сервер', status: 'active', createdAt: '2024-01-25', updatedAt: now, updatedBy: null },
  { id: 'svc11', virtualMachineId: 'vm12', name: 'Apache', version: '2.4.6', port: 80, description: 'Устаревший веб-сервер', status: 'inactive', createdAt: '2023-01-01', updatedAt: now, updatedBy: null },
  { id: 'svc12', virtualMachineId: 'vm11', name: 'Bacula', version: '13.0.0', port: 9101, description: 'Backup daemon', status: 'active', createdAt: '2024-01-10', updatedAt: now, updatedBy: null },
];

const initialAssignments: Assignment[] = [];

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
      departments: initialDepartments,
      positions: initialPositions,
      branches: initialBranches,
      employees: initialEmployees,
      equipment: initialEquipment,
      assignments: initialAssignments,
      virtualMachines: initialVMs,
      services: initialServices,
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

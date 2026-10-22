-- ============================================================
-- Схема базы данных PostgreSQL для системы "УчётТехники"
-- Версия 2.0 — с поддержкой серверной инфраструктуры
-- PostgreSQL 16+, Node.js 22+, TypeScript 5.x
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Таблица пользователей системы (авторизация)
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('admin', 'materially_responsible', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- Таблица отделов организации
-- ============================================================
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Таблица сотрудников (полный список)
-- ============================================================
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    position VARCHAR(255) NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    hire_date DATE NOT NULL,
    dismissal_date DATE,
    is_employed BOOLEAN NOT NULL DEFAULT true,
    workplace VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_is_employed ON employees(is_employed);
CREATE INDEX idx_employees_full_name ON employees(last_name, first_name);

-- ============================================================
-- Таблица категорий оборудования
-- ============================================================
CREATE TABLE equipment_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO equipment_categories (name, slug, description) VALUES
    ('Компьютеры', 'computer', 'Настольные ПК, ноутбуки, моноблоки'),
    ('Мониторы', 'monitor', 'Мониторы и дисплеи'),
    ('Периферия', 'peripheral', 'Принтеры, сканеры, МФУ, клавиатуры, мыши'),
    ('Мебель', 'furniture', 'Столы, стулья, шкафы, стеллажи'),
    ('Серверы', 'server', 'Физическое серверное оборудование'),
    ('Виртуальные машины', 'virtual_machine', 'Виртуальные серверы и контейнеры'),
    ('Сетевое оборудование', 'network', 'Коммутаторы, роутеры, точки доступа'),
    ('Телефоны', 'phone', 'Телефонные аппараты, IP-телефоны'),
    ('Прочее', 'other', 'Прочее оборудование и имущество');

-- ============================================================
-- Таблица оборудования/имущества (с серийными номерами)
-- ============================================================
CREATE TABLE equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category_id UUID REFERENCES equipment_categories(id) ON DELETE SET NULL,
    serial_number VARCHAR(255) NOT NULL, -- Серийный номер для однозначной идентификации
    inventory_number VARCHAR(100) UNIQUE NOT NULL, -- Инвентарный номер
    brand VARCHAR(100),
    model VARCHAR(255),
    purchase_date DATE,
    purchase_price DECIMAL(12, 2),
    write_off_date DATE,
    condition VARCHAR(50) NOT NULL DEFAULT 'good'
        CHECK (condition IN ('new', 'good', 'satisfactory', 'needs_repair', 'written_off')),
    assigned_to_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    location VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_equipment_category ON equipment(category_id);
CREATE INDEX idx_equipment_assigned ON equipment(assigned_to_employee_id);
CREATE INDEX idx_equipment_condition ON equipment(condition);
CREATE INDEX idx_equipment_inventory ON equipment(inventory_number);
CREATE INDEX idx_equipment_serial ON equipment(serial_number);

-- ============================================================
-- Таблица подсетей (VLAN)
-- ============================================================
CREATE TABLE subnets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    cidr VARCHAR(50) NOT NULL, -- Например: 10.0.2.0/24
    description TEXT,
    vlan_id INTEGER,
    gateway VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_subnets_cidr ON subnets(cidr);
CREATE INDEX idx_subnets_vlan ON subnets(vlan_id);

-- Начальные подсети
INSERT INTO subnets (name, cidr, description, vlan_id, gateway) VALUES
    ('Серверная подсеть', '10.0.1.0/24', 'Основная серверная подсеть', 100, '10.0.1.1'),
    ('Подсеть ВМ (продакшн)', '10.0.2.0/24', 'Виртуальные машины продакшн', 200, '10.0.2.1'),
    ('Подсеть ВМ (тестирование)', '10.0.3.0/24', 'Тестовые виртуальные машины', 300, '10.0.3.1'),
    ('DMZ', '10.0.10.0/24', 'Публично доступные сервисы', 500, '10.0.10.1'),
    ('Офисная подсеть', '192.168.1.0/24', 'Основная офисная сеть', 10, '192.168.1.1'),
    ('Сеть управления', '192.168.100.0/24', 'Управление оборудованием', 999, '192.168.100.1');

-- ============================================================
-- Таблица виртуальных машин
-- ============================================================
CREATE TABLE virtual_machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'virtual'
        CHECK (type IN ('virtual', 'container', 'cloud')),
    host_server_id UUID REFERENCES equipment(id) ON DELETE SET NULL, -- Физический сервер-хост
    os VARCHAR(255),
    cpu_cores INTEGER NOT NULL DEFAULT 2,
    ram_gb INTEGER NOT NULL DEFAULT 4,
    disk_gb INTEGER NOT NULL DEFAULT 50,
    -- Двойная ответственность
    responsible_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- За инфраструктуру
    service_responsible_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- За сервисы
    status VARCHAR(50) NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'stopped', 'maintenance', 'decommissioned')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_vm_host ON virtual_machines(host_server_id);
CREATE INDEX idx_vm_responsible ON virtual_machines(responsible_employee_id);
CREATE INDEX idx_vm_service_responsible ON virtual_machines(service_responsible_employee_id);
CREATE INDEX idx_vm_status ON virtual_machines(status);
CREATE INDEX idx_vm_hostname ON virtual_machines(hostname);

-- ============================================================
-- Таблица сетевых интерфейсов (множественные на ВМ)
-- ============================================================
CREATE TABLE network_interfaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    virtual_machine_id UUID NOT NULL REFERENCES virtual_machines(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- eth0, eth1, ens192 и т.д.
    mac_address VARCHAR(17) NOT NULL, -- 00:50:56:A1:01:01
    ip_address VARCHAR(50) NOT NULL,
    subnet_id UUID REFERENCES subnets(id) ON DELETE SET NULL,
    is_public BOOLEAN NOT NULL DEFAULT false, -- Белый IP?
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(virtual_machine_id, name) -- Уникальное имя интерфейса в пределах ВМ
);

CREATE INDEX idx_ni_vm ON network_interfaces(virtual_machine_id);
CREATE INDEX idx_ni_ip ON network_interfaces(ip_address);
CREATE INDEX idx_ni_mac ON network_interfaces(mac_address);
CREATE INDEX idx_ni_subnet ON network_interfaces(subnet_id);
CREATE INDEX idx_ni_public ON network_interfaces(is_public) WHERE is_public = true;

-- ============================================================
-- Таблица сервисов/middleware на ВМ
-- ============================================================
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    virtual_machine_id UUID NOT NULL REFERENCES virtual_machines(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(100),
    port INTEGER,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_services_vm ON services(virtual_machine_id);
CREATE INDEX idx_services_port ON services(port);
CREATE INDEX idx_services_status ON services(status);

-- ============================================================
-- Таблица истории передач оборудования
-- ============================================================
CREATE TABLE equipment_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    returned_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assignments_equipment ON equipment_assignments(equipment_id);
CREATE INDEX idx_assignments_employee ON equipment_assignments(employee_id);
CREATE INDEX idx_assignments_dates ON equipment_assignments(assigned_date, returned_date);

-- ============================================================
-- Таблица аудит-лога действий
-- ============================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL
        CHECK (action IN ('create', 'update', 'delete', 'assign', 'unassign')),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    entity_name VARCHAR(255),
    details TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_action ON audit_log(action);

-- ============================================================
-- Триггеры для автоматического обновления updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subnets_updated_at BEFORE UPDATE ON subnets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vm_updated_at BEFORE UPDATE ON virtual_machines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ni_updated_at BEFORE UPDATE ON network_interfaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Представления для удобных запросов
-- ============================================================

-- ВМ с полной информацией о сетях
CREATE VIEW vm_with_networks AS
SELECT
    vm.id,
    vm.name,
    vm.hostname,
    vm.type,
    vm.os,
    vm.cpu_cores,
    vm.ram_gb,
    vm.disk_gb,
    vm.status,
    host_eq.name AS host_server_name,
    resp_emp.last_name || ' ' || resp_emp.first_name AS infrastructure_responsible,
    svc_emp.last_name || ' ' || svc_emp.first_name AS service_responsible,
    COUNT(ni.id) AS network_interface_count,
    ARRAY_AGG(ni.ip_address) FILTER (WHERE ni.id IS NOT NULL) AS ip_addresses,
    ARRAY_AGG(ni.ip_address) FILTER (WHERE ni.is_public = true) AS public_ips
FROM virtual_machines vm
LEFT JOIN equipment host_eq ON vm.host_server_id = host_eq.id
LEFT JOIN employees resp_emp ON vm.responsible_employee_id = resp_emp.id
LEFT JOIN employees svc_emp ON vm.service_responsible_employee_id = svc_emp.id
LEFT JOIN network_interfaces ni ON vm.id = ni.virtual_machine_id
GROUP BY vm.id, host_eq.name, resp_emp.last_name, resp_emp.first_name,
         svc_emp.last_name, svc_emp.first_name;

-- Оборудование с серийными номерами и ответственным
CREATE VIEW equipment_full AS
SELECT
    eq.id,
    eq.name,
    eq.serial_number,
    eq.inventory_number,
    eq.brand,
    eq.model,
    eq.condition,
    eq.location,
    cat.name AS category_name,
    emp.last_name || ' ' || emp.first_name AS assigned_to,
    eq.created_at,
    eq.updated_at,
    upd.full_name AS updated_by_name
FROM equipment eq
LEFT JOIN equipment_categories cat ON eq.category_id = cat.id
LEFT JOIN employees emp ON eq.assigned_to_employee_id = emp.id
LEFT JOIN users upd ON eq.updated_by = upd.id;

-- ============================================================
-- Начальные данные: пользователи
-- ============================================================
INSERT INTO users (email, password_hash, full_name, role) VALUES
    ('admin@company.ru', '$2b$12$LJ3m4ys3Lk0TSwHjGBOUdu.YBjKr3vQhsPLFqFxQgVwMCxHnGKxWy', 'Иванов Админ Админович', 'admin'),
    ('mat@company.ru', '$2b$12$LJ3m4ys3Lk0TSwHjGBOUdu.YBjKr3vQhsPLFqFxQgVwMCxHnGKxWy', 'Петрова Материальная Ответственная', 'materially_responsible'),
    ('user@company.ru', '$2b$12$LJ3m4ys3Lk0TSwHjGBOUdu.YBjKr3vQhsPLFqFxQgVwMCxHnGKxWy', 'Сидоров Обычный Пользователь', 'viewer');

-- Начальные отделы
INSERT INTO departments (name, description) VALUES
    ('IT-отдел', 'Информационные технологии'),
    ('Бухгалтерия', 'Бухгалтерский учёт и отчётность'),
    ('Отдел продаж', 'Продажи и работа с клиентами'),
    ('Отдел маркетинга', 'Маркетинг и реклама'),
    ('Отдел кадров', 'Управление персоналом'),
    ('Руководство', 'Руководство организации'),
    ('Приёмная', 'Приёмная директора');

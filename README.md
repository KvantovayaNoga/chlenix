# 🖥 Chlenix — IT Asset Management

Современная система учёта ИТ-активов, сотрудников и виртуальной инфраструктуры.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ready-success)

## ✨ Возможности

### 🎯 Управление виртуальными машинами
- **Полный учёт ВМ** с детальным описанием (CPU, RAM, диск, ОС)
- **Множественные сетевые интерфейсы** на каждую ВМ
- **Белые IP-адреса** с визуальной пометкой
- **Двойная ответственность**: за инфраструктуру и за сервисы
- **Сервисы и middleware** на каждой ВМ (Nginx, PostgreSQL, Redis и т.д.)
- **Статусы ВМ**: запущена, остановлена, обслуживание, выведена

### 👥 Управление сотрудниками
- Полный список всех сотрудников организации
- Справочники: отделы, должности, филиалы
- Рабочее место: филиал + этаж + кабинет
- Телефоны: рабочий, внутренний, личный
- Закрепление оборудования и ВМ

### 💻 Учёт оборудования
- **Серийные и инвентарные номера** для однозначной идентификации
- Категории: компьютеры, мониторы, серверы, сеть, мебель и т.д.
- Состояние: новое, хорошее, требует ремонта, списано
- Закрепление за сотрудниками с историей передач

### 🖥 Серверная инфраструктура
- Физические серверы с привязкой к филиалам
- Виртуальные машины на хост-серверах
- Полная сетевая топология

### 🔐 Система ролей
- **Администратор** — полный доступ
- **Материально ответственное лицо** — редактирование данных
- **Пользователь** — только просмотр

### 📊 Дашборд и аналитика
- Статистика по ВМ, серверам, сотрудникам
- Распределение по отделам и категориям
- Аудит всех изменений (кто, когда, что изменил)

## 🚀 Быстрый старт

### Вариант 1: Автоматический деплой (рекомендуется)

```bash
# Клонируйте репозиторий
git clone https://github.com/your-org/chlenix.git
cd chlenix

# Запустите скрипт деплоя
chmod +x deploy.sh
./deploy.sh
```

Скрипт автоматически:
- Проверит наличие Docker
- Создаст `.env` с безопасными секретами
- Соберёт и запустит все сервисы
- Инициализирует базу данных

### Вариант 2: Ручной деплой

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/your-org/chlenix.git
cd chlenix

# 2. Настройте переменные окружения
cp .env.example .env
nano .env  # измените пароли и секреты

# 3. Запустите все сервисы
docker compose up -d --build

# 4. Проверьте статус
docker compose ps
```

### Вариант 3: Локальная разработка (без Docker)

```bash
# Frontend
npm install
npm run dev

# Backend (в другом терминале)
cd backend
npm install
npm run dev
```

## 🔐 Демо-доступ

После первого запуска будут созданы пользователи:

| Роль | Email | Пароль |
|------|-------|--------|
| Администратор | admin@company.ru | admin123 |
| Мат. ответственное лицо | mat@company.ru | mat123 |
| Пользователь | user@company.ru | user123 |

**⚠️ Обязательно смените пароли после первого входа!**

## 🌐 Доступ к системе

После запуска откройте в браузере:

```
http://localhost
```

или

```
http://YOUR_SERVER_IP
```

## 📚 Документация

- **[DEPLOY.md](DEPLOY.md)** — Полная инструкция по деплою
- **[API.md](API.md)** — Документация API (в разработке)
- **[DATABASE.md](DATABASE.md)** — Схема базы данных

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │   Frontend   │   │   Backend    │   │ PostgreSQL  │ │
│  │   (Nginx)    │──▶│  (Node.js)   │──▶│    (DB)     │ │
│  │   Port 80    │   │  Port 4000   │   │  Port 5432  │ │
│  │   React 19   │   │  Hono+Prisma │   │   v16       │ │
│  └──────────────┘   └──────────────┘   └─────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Технологический стек

**Frontend:**
- React 19 + TypeScript 5.x
- Vite 6 (сборщик)
- Tailwind CSS 4 (стили)
- React Router 7 (маршрутизация)
- Zustand (state management)
- Lucide React (иконки)

**Backend:**
- Node.js 22+
- Hono (веб-фреймворк)
- Prisma (ORM)
- PostgreSQL 16 (база данных)
- JWT (аутентификация)
- bcrypt (хеширование паролей)
- Zod (валидация)

**Инфраструктура:**
- Docker + Docker Compose
- Nginx (reverse proxy)
- Let's Encrypt (SSL, опционально)

## 📁 Структура проекта

```
chlenix/
├── docker-compose.yml       # Оркестрация контейнеров
├── Dockerfile               # Frontend (Nginx + React)
├── nginx.conf               # Конфигурация Nginx
├── deploy.sh                # Скрипт быстрого деплоя
├── .env.example             # Пример переменных окружения
├── DEPLOY.md                # Инструкция по деплою
├── README.md                # Этот файл
│
├── backend/
│   ├── Dockerfile           # Backend (Node.js)
│   ├── package.json         # Зависимости
│   ├── tsconfig.json        # TypeScript конфиг
│   ├── prisma/
│   │   └── schema.prisma    # Схема БД (Prisma)
│   └── src/
│       └── index.ts         # API сервер
│
├── database/
│   └── schema.sql           # SQL схема (альтернатива)
│
└── src/                     # Frontend React код
    ├── App.tsx              # Главный компонент
    ├── main.tsx             # Точка входа
    ├── index.css            # Глобальные стили
    ├── types/
    │   └── index.ts         # TypeScript типы
    ├── store/
    │   ├── authStore.ts     # Авторизация
    │   └── dataStore.ts     # Данные приложения
    ├── components/
    │   ├── Layout.tsx       # Общий layout
    │   ├── Sidebar.tsx      # Боковая навигация
    │   └── ProtectedRoute.tsx
    └── pages/
        ├── LoginPage.tsx    # Вход
        ├── RegisterPage.tsx # Регистрация
        ├── DashboardPage.tsx
        ├── ServersPage.tsx  # ВМ (главная)
        ├── PhysicalServersPage.tsx
        ├── EmployeesPage.tsx
        ├── EmployeeDetailPage.tsx
        ├── EquipmentPage.tsx
        ├── DirectoriesPage.tsx
        └── UsersPage.tsx
```

## 🔧 Управление

### Логи

```bash
# Все сервисы
docker compose logs -f

# Конкретный сервис
docker compose logs -f backend
docker compose logs -f postgres
```

### Перезапуск

```bash
# Перезапустить все
docker compose restart

# Пересобрать после изменений
docker compose up -d --build
```

### Остановка

```bash
# Остановить (данные сохранятся)
docker compose down

# Остановить и удалить данные
docker compose down -v
```

## 💾 Резервное копирование

### Бэкап базы данных

```bash
# Создать бэкап
docker compose exec postgres pg_dump -U chlenix chlenix > backup_$(date +%Y%m%d).sql

# Восстановить из бэкапа
cat backup.sql | docker compose exec -T postgres psql -U chlenix chlenix
```

### Автоматический бэкап (cron)

```bash
# Ежедневный бэкап в 3:00
0 3 * * * docker compose exec postgres pg_dump -U chlenix chlenix > /backups/chlenix_$(date +\%Y\%m\%d).sql
```

## 🔒 Безопасность

### Рекомендации для продакшена

1. **Измените все пароли по умолчанию**
   - PostgreSQL пароль в `.env`
   - JWT_SECRET (минимум 32 случайных символа)
   - Пароли демо-пользователей

2. **Используйте HTTPS**
   - Настройте SSL-сертификат (Let's Encrypt)
   - Используйте Caddy или Traefik для автоматического HTTPS

3. **Ограничьте доступ к портам**
   ```env
   # В .env не публикуйте PostgreSQL и backend наружу
   POSTGRES_PORT=  # Оставьте пустым
   BACKEND_PORT=   # Оставьте пустым
   ```

4. **Настройте firewall**
   ```bash
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```

5. **Регулярно обновляйте**
   ```bash
   docker compose pull
   docker compose up -d
   ```

## 📊 Мониторинг

### Проверка здоровья

```bash
# Health check backend
curl http://localhost/api/health

# Статус контейнеров
docker compose ps

# Использование ресурсов
docker stats
```

## 🆘 Решение проблем

### Порт уже занят

```bash
# Найдите процесс
sudo lsof -i :80
sudo lsof -i :4000
sudo lsof -i :5432

# Измените порты в .env
nano .env
```

### Backend не подключается к БД

```bash
# Проверьте PostgreSQL
docker compose ps postgres

# Проверьте логи
docker compose logs postgres

# Перезапустите backend
docker compose restart backend
```

### Полный сброс

```bash
# Остановить и удалить всё
docker compose down -v --rmi all

# Пересобрать с нуля
docker compose up -d --build
```

## 🤝 Участие в разработке

1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📝 Лицензия

MIT License — см. файл [LICENSE](LICENSE)

## 🙏 Благодарности

- [React](https://react.dev/) — UI библиотека
- [Vite](https://vitejs.dev/) — Сборщик
- [Hono](https://hono.dev/) — Веб-фреймворк
- [Prisma](https://www.prisma.io/) — ORM
- [Tailwind CSS](https://tailwindcss.com/) — CSS фреймворк
- [Lucide](https://lucide.dev/) — Иконки

## 📞 Поддержка

Если возникли проблемы:

1. Проверьте логи: `docker compose logs`
2. Убедитесь, что все порты свободны
3. Проверьте `.env` файл
4. Перезапустите сервисы: `docker compose restart`

---

**Разработано с ❤️ для эффективного управления ИТ-инфраструктурой**

[Документация по деплою](DEPLOY.md) • [API Reference](API.md) • [База данных](DATABASE.md)

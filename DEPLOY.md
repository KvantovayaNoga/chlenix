# 🚀 Деплой Chlenix

Полная инструкция по развёртыванию системы Chlenix на Linux-сервере:
в Docker (рекомендуется) или в режиме bare-metal (nginx + systemd + PostgreSQL без Docker).

> 💡 Самый быстрый путь — скрипт `./deploy.sh docker` или `./deploy.sh bare`:
> он сам проверит все необходимые пакеты, создаст `.env` с секретами и выполнит деплой.

## 📋 Требования

- **Docker** 24.0+ ([установка](https://docs.docker.com/get-docker/))
- **Docker Compose** v2.0+ ([установка](https://docs.docker.com/compose/install/))
- **Git** (для клонирования репозитория)
- Минимум **2 GB RAM**, **10 GB disk**

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
│  └──────────────┘   └──────────────┘   └─────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## ⚡ Быстрый старт

### 0. (Опционально) Проверка окружения и автоматический деплой

```bash
# Проверить, всё ли установлено для Docker-деплоя
./deploy.sh check

# Полный автоматический деплой в Docker
chmod +x deploy.sh && ./deploy.sh docker
```

Если используете `deploy.sh`, пункты 1–5 ниже выполнять не нужно — скрипт делает их сам.

### 1. Клонируйте репозиторий

```bash
git clone <URL вашего репозитория> chlenix
cd chlenix
```

### 2. Настройте переменные окружения

```bash
cp .env.example .env
nano .env  # или любой другой редактор
```

**Обязательно измените:**
- `POSTGRES_PASSWORD` — пароль для PostgreSQL
- `JWT_SECRET` — секретный ключ для JWT (минимум 32 символа)
- `CORS_ORIGIN` — домен, с которого будет доступен фронтенд

Пример `.env`:
```env
POSTGRES_USER=chlenix
POSTGRES_PASSWORD=MyStr0ngP@ssw0rd!2024
POSTGRES_DB=chlenix
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
CORS_ORIGIN=https://chlenix.yourdomain.com
VITE_API_URL=https://chlenix.yourdomain.com/api
```

### 3. Запустите все сервисы

```bash
docker compose up -d
```

### 4. Проверьте статус

```bash
docker compose ps
```

Должны быть запущены 3 контейнера:
- `chlenix-postgres` — PostgreSQL
- `chlenix-backend` — Backend API
- `chlenix-frontend` — Frontend (Nginx)

### 5. Откройте в браузере

```
http://localhost
```

или

```
http://YOUR_SERVER_IP
```

## 🔐 Первый запуск — создание администратора

Сервис поставляется **без тестовых и демо-учётных записей** и с пустой базой данных.

Порядок первоначальной настройки:

1. Откройте в браузере адрес сервиса (например, `http://ВАШ_СЕРВЕР`).
2. Нажмите **«Зарегистрироваться»** и создайте первую учётную запись — предметный администратор организации.
3. Первый зарегистрированный пользователь автоматически получает роль **«Администратор»**.
4. Сразу после регистрации откроется пошаговая форма **«Создание организации»** — заполните карточку организации (наименование, ИНН/КПП/ОГРН, адреса, руководство, банковские реквизиты).
5. Далее заполните справочники (отделы, должности, филиалы) и начните вносить активы.

Все остальные пользователи регистрируются через форму регистрации (роль «Пользователь») или создаются администратором в разделе «Пользователи» с нужной ролью.

## 🌐 Настройка домена (опционально)

### Вариант 1: Nginx Reverse Proxy

Если у вас уже есть Nginx на хосте:

```nginx
server {
    listen 80;
    server_name chlenix.yourdomain.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Вариант 2: Caddy (автоматический HTTPS)

```bash
# Установите Caddy
apt install caddy

# Создайте Caddyfile
cat > /etc/caddy/Caddyfile << 'EOF'
chlenix.yourdomain.com {
    reverse_proxy localhost:80
}
EOF

# Перезапустите Caddy
systemctl restart caddy
```

Caddy автоматически получит SSL-сертификат от Let's Encrypt.

### Вариант 3: Traefik

```yaml
# Добавьте в docker-compose.yml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=your@email.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - traefik_certs:/letsencrypt

  frontend:
    labels:
      - "traefik.http.routers.chlenix.rule=Host(`chlenix.yourdomain.com`)"
      - "traefik.http.routers.chlenix.entrypoints=websecure"
      - "traefik.http.routers.chlenix.tls.certresolver=letsencrypt"

volumes:
  traefik_certs:
```

## 🔧 Управление

### Логи

```bash
# Все сервисы
docker compose logs -f

# Конкретный сервис
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f postgres
```

### Перезапуск

```bash
# Перезапустить все
docker compose restart

# Перезапустить конкретный сервис
docker compose restart backend

# Пересобрать после изменений в коде
docker compose up -d --build
```

### Остановка

```bash
# Остановить (данные сохранятся)
docker compose down

# Остановить и удалить данные
docker compose down -v
```

### Обновление

```bash
# Получить последние изменения
git pull

# Пересобрать и перезапустить
docker compose up -d --build
```

## 💾 Резервное копирование

### Бэкап базы данных

```bash
# Создать бэкап
docker compose exec postgres pg_dump -U chlenix chlenix > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из бэкапа
cat backup.sql | docker compose exec -T postgres psql -U chlenix chlenix
```

### Автоматический бэкап (cron)

```bash
# Добавьте в crontab
crontab -e

# Ежедневный бэкап в 3:00
0 3 * * * docker compose exec postgres pg_dump -U chlenix chlenix > /backups/chlenix_$(date +\%Y\%m\%d).sql
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

### Логи приложения

```bash
# Backend логи
docker compose logs -f backend

# Nginx логи
docker compose exec frontend tail -f /var/log/nginx/access.log
```

## 🛠 Решение проблем

### Сборка «висит» на шаге `RUN npm install` (docker build)

Причина: с сервера недоступен `registry.npmjs.org` (блокировка, отсутствие DNS/прокси).
npm по умолчанию не имеет таймаутов и бесконечно ждёт ответа. Диагностика:

```bash
docker run --rm node:22-alpine npm view react version   # если висит — сеть до реестра недоступна
curl -sI --max-time 10 https://registry.npmjs.org       # проверка доступности с хоста
```

Решения (по приоритету):

1. **Зеркало npm** — задайте в `.env`:
   ```bash
   NPM_REGISTRY=https://registry.npmmirror.com
   ```
   `deploy.sh` и `docker-compose.yml` автоматически пробросят его в build-арги.
2. **Прокси** — если в сети компании есть HTTP-прокси, задайте в `.env`
   `HTTP_PROXY` / `HTTPS_PROXY` (пробрасываются в сборку), либо глобально для Docker:
   ```bash
   sudo tee /etc/docker/daemon.json <<'JSON'
   { "proxies": { "http-proxy": "http://proxy:3128", "https-proxy": "http://proxy:3128" } }
   JSON
   sudo systemctl restart docker
   ```
3. **DNS** — если не резолвятся имена, добавьте в `/etc/docker/daemon.json`:
   `{ "dns": ["8.8.8.8", "1.1.1.1"] }` и перезапустите docker.

В проект добавлен `.npmrc` с таймаутами и ретраями (`fetch-timeout`, `fetch-retries`) —
теперь вместо вечного зависания установка быстро переключается между попытками и падает
с понятной ошибкой, если сеть действительно недоступна.

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
# Проверьте, что PostgreSQL запущен
docker compose ps postgres

# Проверьте логи
docker compose logs postgres

# Перезапустите backend
docker compose restart backend
```

### Очистка и полный сброс

```bash
# Остановить и удалить всё
docker compose down -v --rmi all

# Пересобрать с нуля
docker compose up -d --build
```

## 🔒 Безопасность

### Рекомендации для продакшена

1. **Измените все пароли по умолчанию**
   - PostgreSQL пароль
   - JWT_SECRET (минимум 32 случайных символа)
   - Пароли демо-пользователей

2. **Используйте HTTPS**
   - Настройте SSL-сертификат (Let's Encrypt)
   - Настройте редирект с HTTP на HTTPS

3. **Ограничьте доступ к портам**
   ```bash
   # В .env оставьте только необходимые порты
   POSTGRES_PORT=  # Не публикуйте PostgreSQL наружу
   BACKEND_PORT=   # Backend доступен только через Nginx
   ```

4. **Настройте firewall**
   ```bash
   # UFW
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   
   # Или iptables
   iptables -A INPUT -p tcp --dport 80 -j ACCEPT
   iptables -A INPUT -p tcp --dport 443 -j ACCEPT
   ```

5. **Регулярно обновляйте**
   ```bash
   # Обновляйте Docker образы
   docker compose pull
   docker compose up -d
   
   # Обновляйте систему
   apt update && apt upgrade
   ```

## ⚙️ Деплой без Docker (bare-metal)

Для серверов, где Docker не используется: nginx + systemd + локальный PostgreSQL.

```bash
# Только проверка окружения (node, npm, psql, nginx, systemctl, rsync, gcc и т.д.)
./deploy.sh check-bare

# Полный деплой в bare-режиме
sudo ./deploy.sh bare
```

Скрипт автоматически:
- проверит все необходимые пакеты и их версии;
- создаст `.env` со сгенерированными секретами (`JWT_SECRET`, `POSTGRES_PASSWORD`);
- соберёт frontend (`npm run build`) и backend (`tsc` + `prisma generate && migrate deploy`);
- настроит systemd-сервис `chlenix-api` и сайт nginx;
- выполнит миграции базы данных и запустит сервисы.

Полезные команды после деплоя:

```bash
systemctl status chlenix-api     # состояние API
journalctl -u chlenix-api -f     # живые логи API
nginx -t && systemctl reload nginx
```


## 📚 Дополнительная информация

### Структура проекта

```
chlenix/
├── docker-compose.yml       # Оркестрация контейнеров
├── Dockerfile               # Frontend (Nginx + React)
├── nginx.conf               # Конфигурация Nginx
├── .env.example             # Пример переменных окружения
├── backend/
│   ├── Dockerfile           # Backend (Node.js)
│   ├── package.json         # Зависимости
│   ├── prisma/
│   │   └── schema.prisma    # Схема БД
│   └── src/
│       └── index.ts         # API сервер
├── database/
│   └── schema.sql           # SQL схема (альтернатива Prisma)
└── src/                     # Frontend React код
    ├── App.tsx
    ├── pages/
    └── ...
```

### API Endpoints

Все API доступны по пути `/api/`:

- `POST /api/auth/login` — Авторизация
- `POST /api/auth/register` — Регистрация
- `GET /api/users` — Список пользователей
- `GET /api/employees` — Список сотрудников
- `GET /api/equipment` — Список оборудования
- `GET /api/virtual-machines` — Список ВМ
- `GET /api/departments` — Список отделов
- `GET /api/positions` — Список должностей
- `GET /api/branches` — Список филиалов

Полная документация API: [Swagger/OpenAPI](http://localhost/api/docs) (в разработке)

## 🆘 Поддержка

Если возникли проблемы:

1. Проверьте логи: `docker compose logs`
2. Убедитесь, что все порты свободны
3. Проверьте `.env` файл
4. Перезапустите сервисы: `docker compose restart`

## 📝 Лицензия

MIT

---

**Успешного деплоя! 🚀**

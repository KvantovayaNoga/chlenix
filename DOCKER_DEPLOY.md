# 🚀 Развертывание Chlenix в Docker

Полное руководство по развертыванию системы Chlenix с использованием Docker и Docker Compose.

## 📋 Требования

- Docker 20.10+
- Docker Compose 2.0+
- Минимум 2GB RAM
- Минимум 10GB свободного места на диске

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │  PostgreSQL  │  │
│  │   (Nginx)    │  │  (Node.js)   │  │    (DB)      │  │
│  │   Port 80    │  │  Port 4000   │  │  Port 5432   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                  │                  │         │
│         └──────────────────┴──────────────────┘         │
│                        Network                          │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Быстрый старт

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd chlenix
```

### 2. Настройка переменных окружения

Создайте файл `.env` на основе примера:

```bash
cp .env.example .env
```

Отредактируйте `.env` и установите необходимые значения:

```env
# PostgreSQL
POSTGRES_USER=chlenix
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=chlenix
POSTGRES_PORT=5432

# Backend
JWT_SECRET=your_jwt_secret_at_least_32_characters_long
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost

# Frontend
VITE_API_URL=http://localhost/api
HTTP_PORT=80
```

**⚠️ ВАЖНО:** Замените `POSTGRES_PASSWORD` и `JWT_SECRET` на безопасные значения!

### 3. Сборка и запуск

```bash
docker compose up -d --build
```

Эта команда:
- Скачает необходимые Docker образы
- Соберет backend и frontend контейнеры
- Инициализирует базу данных PostgreSQL
- Применит миграции Prisma
- Запустит все сервисы

### 4. Проверка статуса

```bash
docker compose ps
```

Вы должны увидеть три работающих контейнера:

```
NAME                IMAGE                    STATUS
chlenix-frontend    chlenix-frontend         Up
chlenix-backend     chlenix-backend          Up
chlenix-postgres    postgres:16-alpine       Up (healthy)
```

### 5. Открытие приложения

Откройте браузер и перейдите по адресу: **http://localhost**

## 🔐 Первоначальная настройка

При первом запуске система автоматически:
1. ✅ Создаст базу данных PostgreSQL
2. ✅ Применит все миграции Prisma
3. ✅ Создаст начальных пользователей

### Демо-пользователи

| Роль | Email | Пароль |
|------|-------|--------|
| **Администратор** | admin@company.ru | admin123 |
| **Мат. ответственное лицо** | mat@company.ru | mat123 |
| **Пользователь** | user@company.ru | user123 |

**⚠️ ВАЖНО:** После первого входа обязательно измените пароли демо-пользователей!

## 📊 Управление контейнерами

### Просмотр логов

```bash
# Логи всех сервисов
docker compose logs -f

# Логи конкретного сервиса
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Последние 100 строк
docker compose logs --tail=100 backend
```

### Остановка сервисов

```bash
# Остановить все контейнеры (данные сохраняются)
docker compose stop

# Остановить и удалить контейнеры
docker compose down
```

### Перезапуск

```bash
# Перезапустить все сервисы
docker compose restart

# Перезапустить конкретный сервис
docker compose restart backend
```

### Обновление приложения

```bash
# Остановить контейнеры
docker compose down

# Пересобрать и запустить
docker compose up -d --build
```

### Полная очистка (включая данные)

```bash
# ⚠️ ВНИМАНИЕ: Это удалит все данные из базы данных!
docker compose down -v

# Пересобрать и запустить
docker compose up -d --build
```

## 🔧 Решение проблем

### Проблема: Backend не подключается к базе данных

**Симптомы:**
```
Error: Can't reach database server at `postgres:5432`
```

**Решение:**
```bash
# Проверьте статус PostgreSQL
docker compose ps postgres

# Проверьте логи PostgreSQL
docker compose logs postgres

# Перезапустите backend
docker compose restart backend
```

### Проблема: Ошибка миграций Prisma

**Симптомы:**
```
Error: P3005 - Database schema is not empty
```

**Решение:**
```bash
# Полная очистка и пересоздание
docker compose down -v
docker compose up -d --build
```

### Проблема: Порт уже используется

**Симптомы:**
```
Error: Bind for 0.0.0.0:80 failed: port is already allocated
```

**Решение:**
Отредактируйте `.env` и измените порт:
```env
HTTP_PORT=8080  # Или другой свободный порт
```

Затем перезапустите:
```bash
docker compose down
docker compose up -d
```

### Проблема: Frontend не загружается

**Симптомы:**
Белый экран или ошибка 404

**Решение:**
```bash
# Проверьте логи frontend
docker compose logs frontend

# Пересоберите frontend
docker compose down
docker compose build frontend
docker compose up -d
```

### Проблема: Ошибки TypeScript при сборке

**Симптомы:**
```
error TS2305: Module '"jose"' has no exported member 'sign'
```

**Решение:**
Убедитесь, что в `backend/tsconfig.json` установлено:
```json
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": false
  }
}
```

## 💾 Резервное копирование

### Создание бэкапа базы данных

```bash
# Создать бэкап
docker compose exec postgres pg_dump -U chlenix chlenix > backup_$(date +%Y%m%d_%H%M%S).sql

# Проверить размер бэкапа
ls -lh backup_*.sql
```

### Восстановление из бэкапа

```bash
# Остановить backend (чтобы не было подключений к БД)
docker compose stop backend

# Восстановить базу данных
cat backup_20240101_120000.sql | docker compose exec -T postgres psql -U chlenix chlenix

# Запустить backend
docker compose start backend
```

### Автоматический бэкап (cron)

Создайте скрипт `/usr/local/bin/chlenix-backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/chlenix"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

docker compose exec -T postgres pg_dump -U chlenix chlenix > $BACKUP_DIR/backup_$DATE.sql

# Удалить бэкапы старше 30 дней
find $BACKUP_DIR -name "backup_*.sql" -mtime +30 -delete
```

Добавьте в cron:
```bash
chmod +x /usr/local/bin/chlenix-backup.sh
echo "0 2 * * * /usr/local/bin/chlenix-backup.sh" | crontab -
```

## 🔒 Безопасность

### 1. Измените все пароли по умолчанию

```bash
# Смените пароль PostgreSQL
# Отредактируйте .env
POSTGRES_PASSWORD=your_very_strong_password

# Смените JWT_SECRET
JWT_SECRET=$(openssl rand -base64 32)
```

### 2. Настройте HTTPS

Создайте `nginx.ssl.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name chlenix.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://backend:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name chlenix.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 3. Ограничьте доступ к портам

```bash
# UFW (Ubuntu)
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# Не открывайте порты 5432 и 4000 наружу!
```

### 4. Настройте firewall

```bash
# iptables
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -j DROP
```

## 📈 Мониторинг

### Проверка здоровья сервисов

```bash
# Проверка backend
curl http://localhost/api/health

# Проверка PostgreSQL
docker compose exec postgres pg_isready -U chlenix

# Статистика использования ресурсов
docker stats
```

### Логи в реальном времени

```bash
# Все логи
docker compose logs -f

# Только ошибки
docker compose logs -f | grep -i error

# Логи конкретного сервиса с временными метками
docker compose logs -f --timestamps backend
```

## 🔄 Обновление системы

### Обновление до новой версии

```bash
# 1. Создайте бэкап базы данных
docker compose exec postgres pg_dump -U chlenix chlenix > backup_before_update.sql

# 2. Получите последние изменения
git pull origin main

# 3. Пересоберите и перезапустите
docker compose down
docker compose up -d --build

# 4. Проверьте логи
docker compose logs -f
```

### Откат к предыдущей версии

```bash
# 1. Восстановите бэкап базы данных
cat backup_before_update.sql | docker compose exec -T postgres psql -U chlenix chlenix

# 2. Откатите код
git checkout <previous-commit>

# 3. Пересоберите
docker compose down
docker compose up -d --build
```

## 📊 Production рекомендации

### 1. Используйте reverse proxy

Для production окружения рекомендуется использовать reverse proxy (Nginx, Traefik, Caddy):

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
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
      - letsencrypt:/letsencrypt

  frontend:
    labels:
      - "traefik.http.routers.frontend.rule=Host(`chlenix.yourdomain.com`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"

volumes:
  letsencrypt:
```

### 2. Настройте resource limits

```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
  
  postgres:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

### 3. Включите health checks

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## 📞 Поддержка

При возникновении проблем:

1. **Проверьте логи:** `docker compose logs`
2. **Проверьте статус:** `docker compose ps`
3. **Проверьте ресурсы:** `docker stats`
4. **Проверьте сеть:** `docker network ls`

Если проблема не решена:
- Создайте issue в репозитории
- Приложите логи: `docker compose logs > logs.txt`
- Укажите версию Docker: `docker --version`
- Укажите версию Docker Compose: `docker compose version`

## 📚 Дополнительные ресурсы

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Успешного развертывания! 🚀**

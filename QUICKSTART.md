# 🚀 Быстрый старт - Docker развертывание

## ⚡ Быстрое развертывание (3 шага)

### 1️⃣ Настройте окружение

```bash
# Скопируйте пример конфигурации
cp .env.example .env

# Отредактируйте .env и установите безопасные пароли
nano .env  # или vim .env, или любой другой редактор
```

**Минимальные изменения в `.env`:**
```env
POSTGRES_PASSWORD=YourStrongPassword123!
JWT_SECRET=YourRandomSecretKeyAtLeast32CharactersLong
```

### 2️⃣ Запустите систему

```bash
docker compose up -d --build
```

⏳ Подождите 1-2 минуты пока все сервисы запустятся.

### 3️⃣ Откройте приложение

🌐 **http://localhost**

---

## 🔐 Первый запуск

Сервис стартует пустым — без демо-аккаунтов и тестовых данных.

1. Откройте **http://localhost** → «Зарегистрироваться».
2. Первый пользователь автоматически получает роль **👑 Администратор**.
3. Заполните карточку организации → справочники → начинайте учёт активов.

---

## 📋 Основные команды

### Проверка статуса
```bash
docker compose ps
```

### Просмотр логов
```bash
# Все логи в реальном времени
docker compose logs -f

# Логи конкретного сервиса
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Остановка системы
```bash
docker compose down
```

### Перезапуск
```bash
docker compose restart
```

### Обновление
```bash
docker compose down
docker compose up -d --build
```

---

## 🆘 Решение частых проблем

### ❌ Порт 80 уже занят

**Решение:** Измените порт в `.env`:
```env
HTTP_PORT=8080
```
Затем: `docker compose down && docker compose up -d`

### ❌ Backend не подключается к БД

**Решение:**
```bash
# Проверьте статус PostgreSQL
docker compose ps postgres

# Перезапустите backend
docker compose restart backend
```

### ❌ Ошибки при сборке

**Решение:**
```bash
# Полная очистка и пересборка
docker compose down -v
docker compose up -d --build
```

---

## 💾 Бэкап данных

### Создать бэкап
```bash
docker compose exec postgres pg_dump -U chlenix chlenix > backup_$(date +%Y%m%d).sql
```

### Восстановить из бэкапа
```bash
cat backup_20240101.sql | docker compose exec -T postgres psql -U chlenix chlenix
```

---

## 📚 Дополнительная информация

Полная документация: [DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)

---

**Готово! 🎉 Система Chlenix запущена и готова к работе!**

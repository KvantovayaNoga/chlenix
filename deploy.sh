#!/bin/bash

# ============================================================
# Chlenix — Скрипт быстрого деплоя
# ============================================================

set -e

echo "🚀 Chlenix IT Asset Management — Деплой"
echo "========================================"
echo ""

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    echo "Установите Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Проверка Docker Compose
if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose не установлен!"
    echo "Установите Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker и Docker Compose найдены"
echo ""

# Создание .env если не существует
if [ ! -f .env ]; then
    echo "📝 Создаём .env файл из .env.example..."
    cp .env.example .env
    
    # Генерируем случайный JWT_SECRET
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change_this_secret_$(date +%s)")
    sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env 2>/dev/null || \
    sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env 2>/dev/null || true
    
    # Генерируем случайный пароль для PostgreSQL
    PG_PASSWORD=$(openssl rand -base64 16 2>/dev/null || echo "postgres_$(date +%s)")
    sed -i.bak "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$PG_PASSWORD/" .env 2>/dev/null || \
    sed -i '' "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$PG_PASSWORD/" .env 2>/dev/null || true
    
    rm -f .env.bak
    
    echo "✓ .env создан с автоматически сгенерированными секретами"
    echo ""
    echo "⚠️  ВАЖНО: Отредактируйте .env и измените:"
    echo "   - POSTGRES_PASSWORD"
    echo "   - JWT_SECRET"
    echo "   - CORS_ORIGIN (если используете домен)"
    echo ""
else
    echo "✓ .env файл уже существует"
    echo ""
fi

# Остановка старых контейнеров
echo "🛑 Останавливаем старые контейнеры (если есть)..."
docker compose down 2>/dev/null || true
echo ""

# Сборка и запуск
echo "🔨 Собираем и запускаем сервисы..."
docker compose up -d --build
echo ""

# Ожидание готовности
echo "⏳ Ожидаем готовности сервисов..."
sleep 10

# Проверка статуса
echo ""
echo "📊 Статус контейнеров:"
docker compose ps
echo ""

# Проверка здоровья backend
if curl -s http://localhost/api/health > /dev/null 2>&1; then
    echo "✓ Backend API работает!"
else
    echo "⚠️  Backend API ещё не готов, подождите немного..."
fi

echo ""
echo "========================================"
echo "✅ Деплой завершён!"
echo ""
echo "🌐 Откройте в браузере:"
echo "   http://localhost"
echo ""
echo "🔐 Демо-доступ:"
echo "   Админ: admin@company.ru / admin123"
echo "   Мат. лицо: mat@company.ru / mat123"
echo "   Пользователь: user@company.ru / user123"
echo ""
echo "📖 Логи: docker compose logs -f"
echo "🛑 Остановка: docker compose down"
echo "🔄 Перезапуск: docker compose restart"
echo "========================================"

#!/bin/sh
# ============================================================
# Точка входа backend: подготовка БД + запуск API
# Migrations--safe: если папки миграций нет — применяем схему
# через prisma db push (свежая установка без истории миграций).
# ============================================================
set -e

echo "⏳ Ожидаем готовности PostgreSQL..."
# Ждём, пока БД примет соединения (до 60 секунд)
i=0
until node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$connect().then(() => p.\$disconnect()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -gt 60 ]; then
    echo "❌ PostgreSQL недоступен — проверьте DATABASE_URL и состояние контейнера postgres"
    exit 1
  fi
  sleep 1
done
echo "✓ PostgreSQL готов"

if ls prisma/migrations/*/migration.sql >/dev/null 2>&1; then
  echo "🔧 Применяем миграции Prisma (migrate deploy)..."
  npx prisma migrate deploy
else
  echo "🔧 Миграций не найдено — синхронизируем схему через prisma db push..."
  npx prisma db push
fi

echo "🚀 Запускаем Chlenix Backend API..."
exec node dist/index.js

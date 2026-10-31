#!/bin/sh
# ============================================================
# Точка входа backend: подготовка БД + запуск API
# Migrations-safe: если папки миграций нет — применяем схему
# через prisma db push (свежая установка без истории миграций).
#
# Важно: package.json имеет "type": "module", поэтому для
# проверки подключения используется .cjs-файл (CommonJS), а
# ошибки НЕ глотаются — они выводятся в docker logs.
# ============================================================
set -e

# --- Диагностика конфигурации ---
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Переменная окружения DATABASE_URL не задана!"
  echo "   Добавьте POSTGRES_PASSWORD и др. в файл .env на сервере"
  echo "   (cp .env.example .env && отредактируйте значения)."
  exit 1
fi
# Маскируем пароль в логе: postgresql://user:****@host/db
echo "🔍 DATABASE_URL: $(printf '%s' "$DATABASE_URL" | sed -E 's|://([^:/]+):[^@]*@|://\1:****@|')"

cat > /tmp/wait-db.cjs <<'EOF'
// CommonJS-обёртка: в проекте "type": "module", require() напрямую не работает
(async () => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    await p.$connect();
    await p.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('  причина:', e && e.message ? String(e.message).split('\n')[0] : e);
    process.exit(1);
  }
})();
EOF

echo "⏳ Ожидаем готовности PostgreSQL..."
# Ждём, пока БД примет соединения (до 90 секунд)
i=0
until node /tmp/wait-db.cjs; do
  i=$((i+1))
  if [ "$i" -gt 90 ]; then
    echo "❌ PostgreSQL недоступен в течение 90 секунд."
    echo "   Наиболее вероятные причины:"
    echo "   1) Пароль в DATABASE_URL не совпадает с фактическим паролем БД."
    echo "      Если вы меняли POSTGRES_PASSWORD в .env ПОСЛЕ первого запуска,"
    echo "      старый пароль «зашит» в томе postgres_data. Исправление:"
    echo "        docker volume rm chlenix_postgres_data   # ДАННЫЕ БУДУТ УДАЛЕНЫ!"
    echo "        ./deploy.sh docker"
    echo "   2) Неверные POSTGRES_USER/POSTGRES_DB в .env."
    echo "   3) Контейнер postgres аварийно завершается:"
    echo "        docker ps -a && docker logs chlenix-postgres --tail 30"
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

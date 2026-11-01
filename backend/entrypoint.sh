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

# --- Диагностика и самовосстановление Prisma Client ---
# ИСПРАВЛЕНИЕ ГЛАВНОЙ ПРИЧИНЫ ЦИКЛА РЕСТАРТОВ: в ESM-проекте ("type":"module")
# скрипт, лежащий ВНЕ пакета (например /tmp/wait-db.cjs), резолвит bare-импорт
# '@prisma/client' по путям от своего расположения (/tmp/node_modules) — пакет
# там отсутствует физически. Ошибка выглядела как «Cannot find module
# '@prisma/client»», хотя пакет в /app был на месте: canary сборки проходил,
# а контейнер падал по кругу именно на этой проверке ожидания БД.
# Лечение: wait-скрипт создаётся в рабочей директории приложения (рядом с
# package.json/node_modules) и является CommonJS (.cjs обходит "type":"module").
APP_DIR=$(CDPATH= cd -P -- "$(dirname "$0")" 2>/dev/null && pwd) || APP_DIR=$(pwd)
cd "$APP_DIR"
# Ждём, пока другой экземпляр entrypoint (например, параллельный рестарт контейнера)
# допишет файл — читаем только полностью записанный скрипт.
[ -f /app/wait-db.cjs ] && rm -f /app/wait-db.cjs
cat > ./wait-db.cjs.tmp <<'EOF'
// CommonJS-обёртка (расширение .cjs обходит "type": "module" в package.json).
// ВАЖНО: выводим e.code тоже — внутренние ошибки модуля иначе маскируются.
(async () => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    await p.$connect();
    await p.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('  причина:', (e && e.code ? e.code + ': ' : '') + (e && e.message ? String(e.message).split('\n')[0] : e));
    process.exit(1);
  }
})();
EOF
mv -f ./wait-db.cjs.tmp ./wait-db.cjs

# Проверка целостности клиента (уже из APP_DIR — резолвинг идёт от app/node_modules).
# Пишем диагностику в файл, а не в $(...) — вложенные кавычки node -e внутри
# command substitution ненадёжны в разных POSIX-шеллах (busybox/dash/bash).
node - <<'EOF' > /tmp/prisma-diag.txt 2>/dev/null || true
try {
  const c = require('@prisma/client');
  if (typeof c.PrismaClient !== 'function') { console.log('PrismaClient is not a function'); process.exit(0); }
} catch (e) {
  console.log(((e && e.code) || '') + ' | ' + String((e && e.message) || e).split('\n')[0]);
}
EOF
DIAG=$(cat /tmp/prisma-diag.txt 2>/dev/null || true)
rm -f /tmp/prisma-diag.txt
# Если клиент сломан — чиним его ОДИН раз до цикла ожидания: иначе 90 итераций
# wait-цикла с npm ci внутри каждой превращались бы в бесконечную починку.
if [ "$DIAG" != "" ]; then
  echo "🔧 Prisma Client нерабочий ($DIAG) — восстанавливаем на месте..."
  # Порядок: сначала переустановка зависимостей по lock-файлу (даёт prisma CLI
  # даже если он был прунинут dev-зависимостями), затем перегенерация клиента.
  npm ci --no-audit --no-fund 2>&1 | tail -1 \
    || npm install --no-audit --no-fund 2>&1 | tail -1
  npx --no-install prisma generate 2>&1 | tail -2 \
    || npx prisma generate 2>&1 | tail -2
  if ! node -e "const c=require('@prisma/client'); if(typeof c.PrismaClient!=='function') process.exit(1)"; then
    echo "❌ Не удалось восстановить Prisma Client."
    echo "   Обычно помогает чистая пересборка образа на сервере:"
    echo "     docker compose build --no-cache backend && docker compose up -d backend"
    exit 1
  fi
  echo "✓ Prisma Client восстановлен"
fi

echo "⏳ Ожидаем готовности PostgreSQL..."
# Ждём, пока БД примет соединения (до 90 секунд).
# ВАЖНО: аутентификация — детерминированная ошибка. Раньше «Authentication
# failed» (рассинхрон паролей .env и тома postgres_data) ждал все 90 секунд
# и плодил одинаковые строки в логах вместо мгновенной подсказки о решении.
i=0
MAX_WAIT=90
AUTH_FAILS=0
LAST_ERR=""
while true; do
  LAST_ERR=$(node ./wait-db.cjs 2>&1 >/dev/null) && break
  i=$((i+1))

  case "$LAST_ERR" in
    *"Authentication failed"*|*"password authentication"*)
      AUTH_FAILS=$((AUTH_FAILS+1))
      if [ "$AUTH_FAILS" -ge 3 ]; then
        echo "❌ PostgreSQL ОТКЛОНЯЕТ ПАРОЛЬ пользователя \"${POSTGRES_USER:-chlenix}\"."
        echo "   Это НЕ тайминг: пароль в DATABASE_URL (.env) не совпадает с паролем,"
        echo "   записанным в том postgres_data при ПЕРВОМ создании контейнера."
        echo "   (postgres задаёт пароль только при инициализации пустого тома;"
        echo "    последующая смена POSTGRES_PASSWORD в .env его не обновляет.)"
        echo ""
        echo "   Решение A — если данных в базе ещё нет / не жалко (чистый старт):"
        echo "     docker compose stop backend"
        echo "     docker volume rm chlenix_postgres_data"
        echo "     ./deploy.sh docker"
        echo "   Решение B — если данные нужны: запустите заново деплой, он"
        echo "     синхронизирует пароль автоматически (временная trust-аутентификация,"
        echo "     ALTER USER, восстановление pg_hba.conf) без потери данных:"
        echo "     ./deploy.sh docker"
        echo "   Либо вручную (backend должен быть остановлен; введите СТАРЫЙ пароль БД):"
        echo "     docker exec -it chlenix-postgres psql -U ${POSTGRES_USER:-chlenix} -d postgres \\"
        echo "       -c \"ALTER USER ${POSTGRES_USER:-chlenix} WITH PASSWORD '<новый из .env>';\""
        exit 1
      fi
      ;;
  esac

  # Раз в ~15 секунд печатаем диагностику сети до postgres (иначе логи молча повторяются)
  if [ $((i % 15)) -eq 0 ]; then
    echo "   ...ждём ${i}s; диагностика: getent hosts postgres -> $(getent hosts postgres || echo 'DNS НЕ резолвится')"
  fi
  if [ "$i" -gt "$MAX_WAIT" ]; then
    echo "❌ PostgreSQL недоступен в течение ${MAX_WAIT} секунд."
    echo "   Последняя ошибка подключения:"
    echo "     ${LAST_ERR}"
    echo "   Проверьте: docker ps -a && docker logs chlenix-postgres --tail 30"
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

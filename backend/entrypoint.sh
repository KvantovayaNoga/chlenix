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

# --- Синхронизация схемы БД -------------------------------------------------
# ИСПРАВЛЕНИЕ ПРОБЛЕМ СХЕМЫ ПРИ ДЕПЛОЕ (два независимых дефекта):
#
# 1) Контейнер backend мог работать со СТАРЫМ Prisma Client, сшитым со schema
#    предыдущей сборки. Причина в backend/Dockerfile: prod-слой копировал
#    готовый node_modules из builder-слоя и сам `prisma generate` не запускал.
#    Если на сервере пересобирался только frontend (`docker compose up -d --build`
#    без имени сервиса), а кэш builder-слоя «сгорал» — собирался новый образ с
#    dist.js от новой схемы, но без перегенерации клиента. Запросы к новым
#    колонкам падали с P2022 («column ... does not exist») при полностью
#    здоровой БД. Лечение теперь двустороннее: generate выполняется и в
#    Dockerfile, и здесь, на старте контейнера — схема/клиент/БД гарантированно
#    синхронны даже после частично-кэшированной пересборки.
#
# 2) Начиная с Prisma 6.9 у `db push` появился интерактивный prompt («Apply
#    these changes?» / drift-подтверждение). В контейнере stdin не TTY — prompt
#    падает, entrypoint с `set -e` умирает, `restart: unless-stopped` поднимает
#    контейнер снова → цикл рестартов, nginx отдаёт 502/503 на /api/*.
#    Лечение: подбираем набор флагов «не спрашивать подтверждение» перебором —
#    так же, как это делает сам Prisma при обновлении версии CLI. Проверять
#    поддержку флага по --help/--version нельзя (вывод не содержит списка
#    флагов db push), поэтому пробуем варианты по порядку и принимаем первый,
#    который завершился успешно ИЛИ упал с ошибкой уровня БД (P1xxx/P2xxx/
#    P3xxx) — она означает, что аргументы CLI принял и дошёл до применения схемы.
push_variants() {
  echo "--skip-generate --force"
  echo "--skip-generate --accept-data-loss"
  echo "--skip-generate"
}

apply_schema() {
  if ls prisma/migrations/*/migration.sql >/dev/null 2>&1; then
    echo "🔧 Применяем миграции Prisma (migrate deploy)..."
    npx prisma migrate deploy
    return $?
  fi

  # Регенерируем Prisma Client из ТЕКУЩЕЙ schema.prisma перед применением
  # схемы (см. пункт 1 выше). Не критично при ошибке — db push сам дёргает
  # генератор, но явный шаг спасает при сломанном кэше образов.
  echo "🔧 Синхронизируем Prisma Client со схемой (generate)..."
  npx prisma generate || echo "   ⚠️ generate не удался — продолжаем (db push повторит генерацию)"

  local out rc v
  for v in $(push_variants); do
    echo "🔧 Синхронизируем схему через: prisma db push $v"
    # shellcheck disable=SC2086
    out=$(npx prisma db push $v 2>&1); rc=$?
    echo "$out" | tail -12
    if [ "$rc" -eq 0 ]; then
      echo "✓ Схема применена ($v)"
      return 0
    fi
    # Ошибка валидации схемы или отсутствия DATABASE_URL (P1012) — это НЕ про
    # флаги: смысл имеет только «дошёл ли CLI до БД». Если дошёл (P1001/P1003/
    # P2021/P2022/P3014…) — набор флагов корректен, проблема в самой базе,
    # повторять другими флагами бессмысленно.
    if printf '%s' "$out" | grep -Eq 'P10[0-9][0-9]|P2[0-9]{3}|P3[0-9]{3}'; then
      echo "❌ Ба данных отклонила изменения схемы (см. код ошибки выше)."
      return 1
    fi
    echo "   ↳ набор '$v' не подошёл (скорее всего неизвестный флаг) — пробую следующий..."
  done
  return 1
}

# Повторно-безопасная обёртка: если БД недоступна или push упал — выходим с
# кодом 1 (docker перезапустит контейнер и попробует снова), но НЕ молча в
# цикле: причина всегда печатается в docker logs.
if ! apply_schema; then
  echo "❌ Не удалось синхронизировать схему БД. Backend НЕ запускается."
  echo "   Типичные причины:"
  echo "     1) Пароль/DATABASE_URL не совпадает с содержимым тома postgres_data"
  echo "        → ./deploy.sh docker (синхронизирует пароль) или ALTER USER вручную;"
  echo "     2) Конфликт типов/данных при изменении схемы"
  echo "        → проверьте вывод prisma выше; при необходимости"
  echo "          docker exec chlenix-postgres psql -U \${POSTGRES_USER:-chlenix} -d \${POSTGRES_DB:-chlenix}"
  echo "     3) Старый кэш образа без свежей schema.prisma"
  echo "        → docker compose build --no-cache backend && docker compose up -d"
  exit 1
fi
echo "✓ Схема БД синхронизирована"

echo "🚀 Запускаем Chlenix Backend API..."
exec node dist/index.js

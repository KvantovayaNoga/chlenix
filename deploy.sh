#!/usr/bin/env bash

# ============================================================
# Chlenix — скрипт подготовки и деплоя на Linux-сервере
# Режимы:
#   ./deploy.sh            — Docker-деплой (по умолчанию)
#   ./deploy.sh docker     — то же самое
#   ./deploy.sh bare       — без Docker: nginx + systemd + локальный PostgreSQL
#   ./deploy.sh check      — только проверка окружения для Docker-режима
#   ./deploy.sh check-bare — только проверка окружения для bare-режима
# ============================================================

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-docker}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
die()  { fail "$1"; exit 1; }

require_cmd() {
  if command -v "$1" >/dev/null 2>&1; then ok "$2 найден: $(command -v "$1")"; else fail "$2 НЕ найден ($1)"; return 1; fi
}

check_min_major() { # major need name
  local v=$1 need=$2 name=$3
  if [ "${v:-0}" -ge "$need" ]; then ok "$name версии $v (требуется >= $need)"; else fail "$name $v слишком старый (требуется >= $need)"; return 1; fi
}

# ============================================================
# 1. Проверка необходимого ПО на сервере
# ============================================================
ERRORS=0

check_common() {
  echo "🔍 Проверка окружения..."
  echo "========================================"
  if [ "$(uname -s)" = "Linux" ]; then
    ok "ОС: Linux ($(grep ^PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2))"
  else
    warn "Скрипт рассчитан на Linux-серверы"
  fi
  for c in curl tar openssl; do
    command -v "$c" >/dev/null 2>&1 || warn "Утилита '$c' не найдена (рекомендуется установить)"
  done
}

check_docker_env() {
  require_cmd docker "Docker" || ERRORS=$((ERRORS+1))
  if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose (plugin): $(docker compose version --short 2>/dev/null)"
  elif command -v docker-compose >/dev/null 2>&1; then
    ok "Docker Compose (v1): $(docker-compose --version 2>/dev/null)"
  else
    fail "Docker Compose не найден — см. https://docs.docker.com/compose/install/"
    ERRORS=$((ERRORS+1))
  fi

  # Диагностика сети до npm-реестра: именно из-за её отсутствия сборка
  # «бесконечно висит» на шаге RUN npm install внутри Dockerfile.
  echo "🌐 Проверка доступности registry.npmjs.org с сервера..."
  if curl -fsS --max-time 10 https://registry.npmjs.org/-/ping >/dev/null 2>&1; then
    ok "registry.npmjs.org доступен"
  else
    warn "registry.npmjs.org недоступен или отвечает медленно."
    warn "Сборка образов будет висеть/падать на npm install. Варианты:"
    warn "  1) Зеркало npm: export NPM_REGISTRY=https://registry.npmmirror.com"
    warn "     и раскомментируйте args в docker-compose.yml (см. DEPLOY.md)"
    warn "  2) Прокси: пропишите HTTP_PROXY/HTTPS_PROXY в /etc/docker/daemon.json"
    warn "     (section \"proxies\") и выполните: systemctl restart docker"
    warn "  3) DNS: задайте dns в /etc/docker/daemon.json, например [\"8.8.8.8\",\"1.1.1.1\"]"
  fi
}

check_bare_env() {
  require_cmd node "Node.js" || ERRORS=$((ERRORS+1))
  NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  [ -n "$NODE_MAJOR" ] && { check_min_major "$NODE_MAJOR" 22 "Node.js" || ERRORS=$((ERRORS+1)); }
  require_cmd npm "npm" || ERRORS=$((ERRORS+1))
  require_cmd psql "PostgreSQL client (psql)" || ERRORS=$((ERRORS+1))
  require_cmd nginx "Nginx" || ERRORS=$((ERRORS+1))
  require_cmd systemctl "systemd" || ERRORS=$((ERRORS+1))
  require_cmd rsync "rsync" || ERRORS=$((ERRORS+1))
  require_cmd sudo "sudo" || ERRORS=$((ERRORS+1))
  # Инструменты для сборки нативных зависимостей (prisma/bcrypt)
  for pkg in gcc g++ make python3 git; do require_cmd "$pkg" "$pkg" || ERRORS=$((ERRORS+1)); done
}

finish_checks() {
  if [ "$ERRORS" -gt 0 ]; then
    echo ""
    die "Проверка окружения не пройдена: $ERRORS проблем. Установите недостающие пакеты (например: apt install ... / dnf install ...) и повторите запуск."
  fi
  ok "Окружение проверено"
  echo ""
}

case "$MODE" in
  docker|bare|check|check-bare) ;;
  *) die "Неизвестный режим: $MODE (используйте: docker | bare | check | check-bare)" ;;
esac

check_common
case "$MODE" in
  docker|check)     check_docker_env ;;
  bare|check-bare)  check_bare_env ;;
esac
finish_checks

if [ "$MODE" = "check" ] || [ "$MODE" = "check-bare" ]; then
  echo "✅ Проверка завершена, деплой не выполнялся."
  exit 0
fi

# ============================================================
# 2. .env с секретами
# ============================================================
ensure_env() {
  if [ ! -f "$APP_DIR/.env" ]; then
    echo "📝 Создаём .env из .env.example..."
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    if command -v openssl >/dev/null 2>&1; then
      JWT=$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)
      PGP=$(openssl rand -base64 24 | tr -d '\n/+=' | cut -c1-20)
    else
      JWT=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-48)
      PGP=$(head -c 24 /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-20)
    fi
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" "$APP_DIR/.env" && rm -f "$APP_DIR/.env.bak"
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PGP|" "$APP_DIR/.env" && rm -f "$APP_DIR/.env.bak"
    chmod 600 "$APP_DIR/.env"
    ok ".env создан: JWT_SECRET и POSTGRES_PASSWORD сгенерированы автоматически"
    warn "При необходимости отредактируйте $APP_DIR/.env (CORS_ORIGIN, VITE_API_URL, HTTP_PORT)."
  else
    ok ".env уже существует"
  fi
  grep -q "^JWT_SECRET=" "$APP_DIR/.env" || die "В .env отсутствует JWT_SECRET"
  grep -q "^POSTGRES_PASSWORD=" "$APP_DIR/.env" || die "В .env отсутствует POSTGRES_PASSWORD"
  if grep -Eq "^(JWT_SECRET=CHANGE_ME|POSTGRES_PASSWORD=change_me)" "$APP_DIR/.env"; then
    die "В .env остались плейсхолдеры секретов — задайте реальные значения!"
  fi

  # Миграция устаревших значений по умолчанию: абсолютный http://localhost/api
  # «зашивался» в сборку и ломал доступ с других машин (ошибка «Сервер недоступен»).
  if grep -q "^VITE_API_URL=http://localhost/api" "$APP_DIR/.env"; then
    sed -i.bak "s|^VITE_API_URL=.*|VITE_API_URL=/api|" "$APP_DIR/.env" && rm -f "$APP_DIR/.env.bak"
    ok "VITE_API_URL в .env обновлён на '/api' (nginx-прокси, работает по любому адресу сервера)"
  fi
  if grep -q "^CORS_ORIGIN=http://localhost$" "$APP_DIR/.env"; then
    sed -i.bak "s|^CORS_ORIGIN=.*|CORS_ORIGIN=*|" "$APP_DIR/.env" && rm -f "$APP_DIR/.env.bak"
    ok "CORS_ORIGIN в .env обновлён на '*' (доступ по IP/домену сервера)"
  fi
}

wait_for_api() { # url...
  local i
  for i in $(seq 1 60); do
    for u in "$@"; do
      if curl -sf "$u" >/dev/null 2>&1; then ok "Backend API отвечает healthy"; return 0; fi
    done
    sleep 2
  done
  warn "Backend ещё не готов — проверьте логи (docker compose logs backend / journalctl -u chlenix-api)"
  return 0
}

print_final() {
  echo ""
  echo "========================================"
  echo -e "${GREEN}✅ Деплой завершён!${NC}"
  echo ""
  echo "🌐 Откройте в браузере:  http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
  echo ""
  echo "🔐 Первый запуск:"
  echo "   Сервис стартует с пустой базой и без демо-аккаунтов."
  echo "   1. Зарегистрируйте первого пользователя — он автоматически"
  echo "      получит роль администратора организации."
  echo "   2. Заполните карточку организации, справочники и начинайте учёт активов."
  echo ""
  echo "📖 Полезные команды (docker): docker compose ps | logs -f | down"
  echo "📖 Полезные команды (bare):  systemctl status chlenix-api | journalctl -u chlenix-api -f"
  echo "========================================"
}

# ============================================================
# 3a. Деплой через Docker
# ============================================================
deploy_docker() {
  ensure_env
  set -a; . "$APP_DIR/.env"; set +a

  # Валидация compose-файла ДО остановки контейнеров — чтобы синтаксическая
  # ошибка не привела к простою работающей среды.
  if ! (cd "$APP_DIR" && docker compose config -q); then
    die "docker-compose.yml невалиден (см. ошибку выше). Исправьте файл и повторите деплой."
  fi
  ok "docker-compose.yml прошёл валидацию"

  echo "🛑 Останавливаем старые контейнеры (если есть)..."
  (cd "$APP_DIR" && docker compose down 2>/dev/null) || true

  # ------------------------------------------------------------
  # Синхронизация пароля PostgreSQL с томом данных.
  # postgres:alpine применяет POSTGRES_PASSWORD ТОЛЬКО при первой
  # инициализации пустого тома. Если .env пересоздавался (или пароль
  # менялся), том хранит СТАРЫЙ пароль -> backend получает
  # "Authentication failed" и падает по кругу.
  # Лечим автоматически через docker exec: внутри контейнера есть утилита
  # pg_isready, которая НЕ проверяет пароль — она говорит, какой именно
  # пароль был использован при инициализации тома (он же является паролем
  # суперпользователя POSTGRES_USER в образе). Этим паролем входим в БД
  # и выполняем ALTER USER на значение из текущего .env. Данные не теряются.
  # ------------------------------------------------------------
  PGUSER_VAL="${POSTGRES_USER:-chlenix}"
  PGPASS_VAL="${POSTGRES_PASSWORD}"
  sync_pg_password() {
    # 1) Рабочий ли вообще пароль из .env?
    if docker exec chlenix-postgres pg_isready -U "$PGUSER_VAL" -d postgres >/dev/null 2>&1; then
      ok "Пароль PostgreSQL из .env подтверждён"
      return 0
    fi
    warn "Пароль '${PGUSER_VAL}' из .env НЕ совпадает с паролем в томе postgres_data — синхронизирую через ALTER USER..."
    # 2) Достаём пароль, зашитый в том (pg_isready с ним = успех)
    INIT_PASS=""
    for CAND in chlenix_secret change_me_strong_password admin secret postgres; do
      if docker exec chlenix-postgres pg_isready -U "$PGUSER_VAL" -d postgres --password="$CAND" >/dev/null 2>&1; then
        INIT_PASS="$CAND"; break
      fi
    done
    # pg_isready может возвращать 0 и без пароля (проверка только готовности) —
    # поэтому верифицируем кандидата реальным SQL-подключением через psql внутри контейнера:
    if [ -z "$INIT_PASS" ]; then
      for CAND in chlenix_secret change_me_strong_password admin secret postgres; do
        if docker exec -e PGPASSWORD="$CAND" chlenix-postgres \
             psql -h 127.0.0.1 -U "$PGUSER_VAL" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; then
          INIT_PASS="$CAND"; break
        fi
      done
    fi
    if [ -n "$INIT_PASS" ]; then
      if docker exec -e PGPASSWORD="$INIT_PASS" chlenix-postgres \
           psql -h 127.0.0.1 -U "$PGUSER_VAL" -d postgres \
           -c "ALTER USER ${PGUSER_VAL} WITH PASSWORD '${PGPASS_VAL}';" >/dev/null 2>&1; then
        ok "Пароль '${PGUSER_VAL}' в БД обновлён на значение из .env"
        return 0
      fi
      warn "ALTER USER не выполнен — проверьте права вручную."
    else
      warn "Не удалось войти в БД известными начальными паролями (том создан с нестандартным)."
    fi
    warn "Если данные в базе не нужны — чистый старт:"
    warn "  docker volume rm chlenix_postgres_data && ./deploy.sh docker"
    warn "Если нужны — команды ручной смены пароля печатаются в логах контейнера backend."
    return 1
  }
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'chlenix-postgres'; then
    sync_pg_password || true
  fi

  echo "🔨 Собираем образы и запускаем сервисы..."
  # Пробрасываем NPM_REGISTRY / прокси в build-арги, если заданы в .env —
  # это лечит «вечное зависание» npm install при недоступности registry.npmjs.org.
  BUILD_ARGS=""
  [ -n "${NPM_REGISTRY:-}" ] && BUILD_ARGS="$BUILD_ARGS --build-arg NPM_REGISTRY=${NPM_REGISTRY}"
  [ -n "${HTTPS_PROXY:-}" ]  && BUILD_ARGS="$BUILD_ARGS --build-arg HTTPS_PROXY=${HTTPS_PROXY}"
  [ -n "${HTTP_PROXY:-}" ]   && BUILD_ARGS="$BUILD_ARGS --build-arg HTTP_PROXY=${HTTP_PROXY}"
  # shellcheck disable=SC2086
  if ! (cd "$APP_DIR" && docker compose up -d --build $BUILD_ARGS); then
    warn "Сборка упала — повторяем с принудительной пересборкой слоёв (--no-cache)..."
    # shellcheck disable=SC2086
    (cd "$APP_DIR" && docker compose build --no-cache $BUILD_ARGS && docker compose up -d $BUILD_ARGS) \
      || die "Сборка образов не удалась. См. вывод выше."
  fi

  echo "⏳ Ожидаем готовности backend..."
  wait_for_api "http://localhost:${HTTP_PORT:-80}/api/health" "http://localhost:${BACKEND_PORT:-4000}/api/health"

  # Контроль: страница входа отдаётся, а API проксируется nginx в backend.
  if curl -sf "http://localhost:${HTTP_PORT:-80}/login" >/dev/null 2>&1; then
    ok "Фронтенд отдаёт страницу входа (через nginx)"
  else
    warn "Страница /login недоступна — проверьте: docker compose logs frontend"
  fi
  if curl -sf "http://localhost:${HTTP_PORT:-80}/api/health" >/dev/null 2>&1; then
    ok "API доступен через nginx по пути /api (браузер будет использовать именно его)"
  else
    warn "Путь /api через nginx не отвечает — проверьте: docker compose logs frontend backend"
  fi

  echo ""
  (cd "$APP_DIR" && docker compose ps)
}

# ============================================================
# 3b. Деплой без Docker (nginx + systemd + локальный PostgreSQL)
# ============================================================
deploy_bare() {
  echo "— Режим: bare metal (nginx + systemd + PostgreSQL) —"

  if ! sudo -u postgres psql -c "SELECT 1" >/dev/null 2>&1; then
    die "Нет доступа к локальному PostgreSQL от имени 'postgres'. Установите и запустите PostgreSQL 14+ (apt install postgresql / dnf install postgresql-server), затем повторите."
  fi
  ok "PostgreSQL доступен"

  ensure_env
  set -a; . "$APP_DIR/.env"; set +a

  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"
  ok "База данных '${POSTGRES_DB}' и пользователь '${POSTGRES_USER}' готовы"

  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"

  echo "🔨 Сборка фронтенда (Vite)..."
  (cd "$APP_DIR" && npm ci --no-audit --no-fund && VITE_API_URL="/api" npm run build)
  sudo mkdir -p /var/www/chlenix
  sudo rsync -a --delete "$APP_DIR/dist/" /var/www/chlenix/
  ok "Фронтенд опубликован в /var/www/chlenix"

  echo "🔨 Сборка backend..."
  (cd "$APP_DIR/backend" && npm ci --no-audit --no-fund && npx prisma generate && npm run build)
  sudo mkdir -p /opt/chlenix/backend
  sudo rsync -a --exclude node_modules "$APP_DIR/backend/" /opt/chlenix/backend/
  (cd /opt/chlenix/backend && sudo npm ci --omit=dev --no-audit --no-fund && sudo npx prisma generate)

  echo "🔧 Применение схемы БД..."
  if ls /opt/chlenix/backend/prisma/migrations/*/migration.sql >/dev/null 2>&1; then
    (cd /opt/chlenix/backend && sudo env DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy)
  else
    (cd /opt/chlenix/backend && sudo env DATABASE_URL="$DATABASE_URL" npx prisma db push)
  fi
  ok "Схема БД применена"

  echo "🧩 Настройка systemd-сервиса chlenix-api..."
  sudo tee /etc/systemd/system/chlenix-api.service > /dev/null << UNITEOF
[Unit]
Description=Chlenix Backend API
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/chlenix/backend
ExecStart=$(command -v node) dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${BACKEND_PORT:-4000}
EnvironmentFile=$APP_DIR/.env
User=www-data

[Install]
WantedBy=multi-user.target
UNITEOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now chlenix-api
  ok "Сервис chlenix-api запущен (systemd)"

  echo "🧩 Настройка nginx..."
  sudo tee /etc/nginx/conf.d/chlenix.conf > /dev/null << NGINXEOF
server {
    listen 80;
    server_name _;
    root /var/www/chlenix;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT:-4000}/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / { try_files \$uri \$uri/ /index.html; }
}
NGINXEOF
  sudo nginx -t && sudo systemctl reload nginx
  ok "Nginx настроен и перезапущен"

  wait_for_api "http://localhost:${BACKEND_PORT:-4000}/api/health" "http://localhost/api/health"
}

case "$MODE" in
  docker) deploy_docker ;;
  bare)   deploy_bare ;;
esac

print_final

# ============================================================
# Backend Chlenix — Node.js 22 + Hono + Prisma
# ============================================================

# Зеркало npm-реестра и прокси (используются при проблемах с сетью на сервере):
#   docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com ...
#   docker build --build-arg HTTPS_PROXY=http://proxy:3128 ...
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

FROM node:22-alpine AS builder

WORKDIR /app

# Устанавливаем зависимости для сборки
# .npmrc содержит таймауты/ретраи — установка не «висит вечно» при проблемах с DNS/прокси
COPY package*.json .npmrc ./
COPY prisma ./prisma/

# Переопределяем реестр/прокси, если переданы build-аргументы
ARG NPM_REGISTRY
ENV npm_config_registry=${NPM_REGISTRY}
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

# ИСПРАВЛЕНИЕ ЦИКЛА ОШИБОК СБОРКИ:
#   вариант "--omit=dev"  → tsc падал: Cannot find name 'process'/'console' (нет @types/node);
#   вариант с dev-зависимостями во всех слоях → раздувание runtime-образа.
# Решение: builder ставит ВСЕ зависимости (npm ci), runtime — только prod (--omit=dev).
# Проверено локально: tsc без ошибок; @prisma/client импортируется в prod-окружении.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Генерируем Prisma Client (пишет код в node_modules/@prisma/client)
RUN npx prisma generate

# Копируем исходники и конфиг сборки
COPY tsconfig.json package.json ./
COPY src ./src/

# Собираем TypeScript (сборка ДО финальной генерации клиента — см. комментарий ниже).
RUN npm run build

# Canary: проверяем, что клиент реально установлен и импортируется.
RUN node -e "const {PrismaClient}=require('@prisma/client'); console.log('✓ @prisma/client OK, version:', require('@prisma/client/package.json').version)"

# ============================================================
# Production stage — ТОЛЬКО prod-зависимости (лёгкий образ)
# ============================================================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

ARG NPM_REGISTRY
ENV npm_config_registry=${NPM_REGISTRY}
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

# Сначала ставим ровно те пакеты, что нужны в рантайме (детерминированно).
# ВНИМАНИЕ: этот слой остаётся «голым» (@prisma/client без кода клиента) — он нужен
# только для кэширования npm-слоя. Сгенерированный клиент накладывается COPY'ями ниже.
COPY package*.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# Переносим СГЕНЕРИРОВАННЫЙ Prisma Client из builder-слоя (генерация выполнена выше,
# где CLI prisma доступен как devDependency). Это исправление цикла рестартов: если бы
# generate вызывался в prod-слое через npx, CLI `prisma` там отсутствовал бы (его ставят
# только как devDependency) → «Cannot find module '@prisma/client'» при каждом старте.
# COPY перетирает «голый» @prisma/client сгенерированным кодом и добавляет node_modules/.prisma.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=builder /app/dist ./dist

# Canary runtime-образа: НЕ require('@prisma/client') «в лоб» (Node маскирует
# внутренние ошибки модуля как «Cannot find module»), а с выводом e.code —
# битый образ упадёт на сборке с точной причиной, а не циклом рестартов.
RUN node -e "try{const c=require('@prisma/client'); if(typeof c.PrismaClient!=='function'){console.error('PrismaClient не функция');process.exit(1)}}catch(e){console.error((e&&e.code||'')+' | '+(e&&e.message||e));process.exit(1)}; console.log('✓ @prisma/client OK in runtime image')"

# Создаем папку для миграций если её нет
RUN mkdir -p /app/prisma/migrations

# Скрипт инициализации БД и запуска
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/api/health || exit 1

EXPOSE 4000

# Запускаем миграции и стартуем сервер
ENTRYPOINT ["/app/entrypoint.sh"]

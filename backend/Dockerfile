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

RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Генерируем Prisma Client
RUN npx prisma generate

# Копируем исходники
COPY tsconfig.json ./
COPY src ./src/

# Собираем TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Копируем только нужные файлы
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Генерируем Prisma Client
RUN npx prisma generate

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

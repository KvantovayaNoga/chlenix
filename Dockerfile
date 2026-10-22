# ============================================================
# Multi-stage build для фронтенда Chlenix
# Stage 1: Сборка React-приложения
# Stage 2: Nginx для раздачи статики
# ============================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --no-audit --no-fund

# Копируем исходники
COPY . .

# Принимаем VITE_API_URL как build arg
ARG VITE_API_URL=http://localhost/api
ENV VITE_API_URL=${VITE_API_URL}

# Собираем production-сборку
RUN npm run build

# Stage 2: Nginx для раздачи статики
FROM nginx:1.27-alpine

# Удаляем стандартный конфиг
RUN rm /etc/nginx/conf.d/default.conf

# Копируем наш конфиг nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранную статику из builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

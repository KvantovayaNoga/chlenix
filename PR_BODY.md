# Chlenix: миграция данных в БД, исправления для продакшена, светлая/тёмная тема

## Что сделано

### Данные хранятся на сервере (PostgreSQL)
- Фронтенд переведён с localStorage (zustand persist) на REST API: новые `src/api/client.ts` (fetch + JWT), переписаны `authStore.ts` и `dataStore.ts`.
- Backend (Hono + Prisma): роуты пользователей, организаций, оборудования, ВМ, справочников, истории изменений; нормализация внешних ключей (`resolveRef`), проверки уникальности email/инвентарных номеров/названий, защита от удаления используемых записей, аудит действий, bcrypt-сравнение паролей, единый обработчик ошибок.
- Prisma-схема дополнена моделями `Organization`, `HistoryRecord`, полями `avatar`, `theme`, `organizationId`. Выбор темы сохраняется в профиле пользователя (`PATCH /users/me/theme`).

### Исправления блокировок деплоя
- Синтаксическая ошибка компиляции backend (TS1005) — исправлено, `tsc` проходит без ошибок.
- «Сервер недоступен» при регистрации: фронтенд обращался к зашитому `http://localhost/api`. Теперь используется относительный путь `/api` (nginx проксирует на backend), значения по умолчанию исправлены в Dockerfile, docker-compose.yml и .env.example; deploy.sh автоматически мигрирует устаревший .env и выполняет smoke-тесты после запуска.
- Ошибка валидации compose `services.frontend.environment must be a mapping`: удалена пустая секция `environment:`; добавлена предпроверка `docker compose config -q` в deploy.sh.
- CORS на backend поддерживает `*` и список origins через запятую.

### Тема и UI
- Переключатель светлой/тёмной/системной темы (`ThemeToggle`) размещён в сайдбаре (компактный режим при свёрнутом сайдбаре), выбор сохраняется в БД.
- Все компоненты унифицированы под двойную тему (HistoryLog, FilterManager, EmployeeSearch, UserProfilePage, OrganizationPage, страницы серверов/оборудования и модалки).
- Редирект на /login при истечении JWT-сессии.

### Чистота кода
- Удалены следы отладки (console.log/debugger, закомментированный код, заглушки), `substr()` → `slice()`, синхронизированы перечисления ОКФ.
- node_modules и dist исключены из git (репозиторий содержит только исходники — 58 файлов).

## Проверки
- Фронтенд: `tsc --noEmit` ✓, `npm run build` ✓
- Backend: `tsc --noEmit` ✓, `npm run build` ✓
- `bash -n deploy.sh` ✓, `docker compose config -q` ✓

## Деплой
```bash
cd /opt/chlenix && git pull && ./deploy.sh docker
```

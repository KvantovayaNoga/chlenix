import { useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { api } from '../api/client';
import { FullHistoryModal, useEntityHistory } from '../components/HistoryLog';
import {
  Building2,
  Pencil,
  Trash2,
  Save,
  X,
  Plus,
  Users,
  Monitor,
  MapPin,
  Phone,
  Mail,
  Globe,
  Crown,
  Landmark,
  Wallet,
  BadgeCheck,
  Briefcase,
  History,
} from 'lucide-react';
import type { Organization, OrganizationLegalForm, Employee } from '../types';
import { HeadStar } from '../components/HeadStar';
import { formatDate } from '../utils/formatDate';


const inputCls =
  'w-full px-4 py-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none placeholder-gray-400 dark:placeholder-gray-500';
const labelCls = 'block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1';

// Скелетон карточки организации: показывается, пока данные из хранилища
// ещё не подгружены после обновления страницы (F5), чтобы не мелькало
// сообщение «У вас ещё нет организации». Структура повторяет реальную
// карточку: шапка с логотипом/названиями/контактами, 4 плитки статистики,
// блоки реквизитов и контактов.
function SkeletonBox({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200/80 dark:bg-gray-700/70 ${className}`} />;
}

function OrganizationSkeleton() {
  const rows = [70, 55, 62, 48, 66];
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10" aria-busy="true" aria-label="Загрузка карточки организации">
      {/* Header card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-30" />
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <SkeletonBox className="w-20 h-20 !rounded-2xl flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-3">
                <SkeletonBox className="h-8 w-64 max-w-full" />
                <SkeletonBox className="h-6 w-16 !rounded-full" />
              </div>
              <SkeletonBox className="h-4 w-80 max-w-full" />
              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
                <SkeletonBox className="h-4 w-44" />
                <SkeletonBox className="h-4 w-28" />
                <SkeletonBox className="h-4 w-36" />
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <SkeletonBox className="h-9 w-32 !rounded-xl" />
              <SkeletonBox className="h-9 w-24 !rounded-xl" />
            </div>
          </div>
          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-600/50 bg-gray-50 dark:bg-gray-700/50 p-4 space-y-2">
                <SkeletonBox className="h-3 w-24" />
                <SkeletonBox className="h-5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <SkeletonBox className="h-4 w-4 !rounded" />
              <SkeletonBox className="h-4 w-40" />
            </div>
            <div className="space-y-3">
              {rows.map((w, i) => (
                <div key={i} className="flex justify-between items-center gap-4">
                  <SkeletonBox className="h-4 w-32 flex-shrink-0" />
                  <div
                    className="h-4 rounded-lg animate-pulse bg-gray-200/80 dark:bg-gray-700/70"
                    style={{ width: `${w}%`, animationDelay: `${card * 120 + i * 60}ms` }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyOrganizationState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-10 md:p-14 max-w-xl w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-500/20 rounded-2xl mb-6 border border-indigo-500/30">
          <Building2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">У вас ещё нет организации</h2>
        <p className="text-gray-500 dark:text-slate-400 mb-8 leading-relaxed">
          Создайте карточку своей организации, чтобы вести учёт сотрудников, оборудования и активов.
          После создания вы сможете просматривать и редактировать реквизиты в любое время.
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-all duration-200 shadow-lg shadow-indigo-600/30"
        >
          <Plus className="w-5 h-5" />
          Создать организацию
        </button>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-4">
        <Icon className="w-4 h-4" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, action }: { label: string; value?: string | number | null; action?: ReactNode }) {
  const empty = value === undefined || value === null || String(value).trim() === '';
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:gap-4 py-1">
      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium sm:text-right ${empty ? 'text-gray-600 italic' : 'text-gray-800 dark:text-gray-200'}`}>
        {empty ? 'не указан' : String(value)}
        {action}
      </span>
    </div>
  );
}

// Нормализация URL сайта: если пользователь ввёл адрес без протокола — добавляем https://
// (используется интерактивной ссылкой на сайт в шапке карточки организации)
function normalizeWebsiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Интерактив (карта / tel / mailto / ссылка на сайт) остался только в ШАПКЕ
// карточки организации. В блоке «Адрес и контакты» по требованию UI — только
// статичный текст, без ссылок и действий.

export function OrganizationPage() {
  const navigate = useNavigate();
  const { currentUser, canEditOrganization, isAdmin, canCreateOrganization } = useAuthStore();
  const { users } = useAuthStore();
  const { organizations, updateOrganization, deleteOrganization, employees, equipment, error: storeError } = useDataStore();
  // Флаги загрузки данных: после обновления страницы (F5) организации и данные
  // пользователя подгружаются асинхронно. Пока загрузка не завершена, вместо
  // пустого состояния показываем скелетон карточки организации.
  const { loaded: dataLoaded, loading: dataLoading } = useDataStore();
  const { bootstrapping, initialized } = useAuthStore();

  const organization = currentUser?.organizationId
    ? organizations.find((o) => o.id === currentUser.organizationId)
    : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Модалка полной истории изменений организации (открывается кнопкой в шапке)
  const [historyOpen, setHistoryOpen] = useState(false);

  // ВАЖНО: все хуки должны вызываться ДО любых ранних return'ов.
  // Ранее useEntityHistory вызывался ниже проверки `if (!organization) return …`,
  // из-за чего при заходе на страницу / обновлении (F5) количество хуков менялось
  // между рендерами (скелетон → карточка) и React падал с ошибкой #310
  // («Rendered more hooks than during the previous render»).
  // История подгружается только когда организация известна (path === null — пауза).
  const { history: orgHistory } = useEntityHistory(
    organization ? `/organizations/${organization.id}/history` : null
  );

  if (!organization) {
    // Данные ещё не подгрузились (стартап/обновление страницы F5) — не показываем
    // «У вас ещё нет организации», рисуем фоновые поля по структуре карточки.
    const isHydrating = bootstrapping || !initialized || dataLoading || !dataLoaded;
    if (isHydrating) {
      return <OrganizationSkeleton />;
    }
    // Пользователь состоит в организации, но её запись ещё не найдена —
    // тоже ждём данные, а не пугаем пустым состоянием.
    if (currentUser?.organizationId && organizations.length === 0) {
      return <OrganizationSkeleton />;
    }
    return canCreateOrganization()
      ? <EmptyOrganizationState onCreate={() => navigate('/organization/create')} />
      : (
        // Просмотр пустого состояния для ролей без права создания организации
        // (синхронно с бэкендом: POST /api/organizations — ORG_CREATE_ROLES = admin|HR)
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <Building2 className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-2">Организация ещё не создана</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-md">
            Создание организаций доступно администратору системы и специалисту по кадрам.
            Обратитесь к ним, чтобы присоединиться к существующей организации.
          </p>
        </div>
      );
  }

  const memberCount = users.filter((u) => u.organizationId === organization.id).length || 1;

  // История изменений организации подгружается с сервера через useEntityHistory
  // (см. начало компонента — хук вызывается до ранних return'ов, мгновенно
  // обновляется после любого сохранения).

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* Header card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0 overflow-hidden">
              {organization.logo ? (
                <img src={organization.logo} alt={organization.name} className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-10 h-10 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {/* Переключение организаций и создание новой вынесены в сайдбар
                  («Сменить организацию» / «+ Создать организацию») — внутри карточки
                  организации эти кнопки больше не нужны. */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Крупным шрифтом — краткое наименование организации.
                    Жирность убрана по требованию UI: обычный (normal) вес шрифта. */}
                <h1 className="text-2xl md:text-3xl font-normal tracking-tight text-gray-900 dark:text-white">
                  {organization.shortName || organization.name}
                </h1>
                <span className="px-3 py-1 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-semibold">
                  {organization.legalForm || '—'}
                </span>
              </div>
              {/* Внизу сереньким — полное наименование */}
              {organization.name && (
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{organization.name}</p>
              )}
              {/* Строка контактов под наименованием организации: адрес, телефон,
                  эл. почта и сайт умещены в одну горизонтальную строку.
                  Интерактив возвращён по требованию UI: клик по адресу открывает
                  Яндекс.Карты, телефон — tel:-набор, почта — mailto:, сайт —
                  переход по ссылке. Hover-эффект — как у аналогичных элементов
                  проекта (переход цвета в indigo, БЕЗ подчёркивания).
                  В блоке «Адрес и контакты» ниже интерактива нет — только текст. */}
              {(organization.city || organization.legalAddress || organization.phone || organization.email || organization.website) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {(organization.city || organization.legalAddress) && (
                    <a
                      href={`https://yandex.ru/maps/?text=${encodeURIComponent([organization.postalCode, organization.city, organization.legalAddress].filter(Boolean).join(', ').trim())}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Показать адрес на Яндекс Картах"
                    >
                      <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      {[organization.postalCode, organization.city, organization.legalAddress].filter(Boolean).join(', ')}
                    </a>
                  )}
                  {organization.phone && (
                    <a
                      href={`tel:${organization.phone.replace(/[^\d+]/g, '')}`}
                      className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Позвонить"
                    >
                      <Phone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      {organization.phone}
                    </a>
                  )}
                  {organization.email && (
                    <a
                      href={`mailto:${organization.email.trim()}`}
                      className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Написать письмо"
                    >
                      <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      {organization.email}
                    </a>
                  )}
                  {organization.website && (
                    <a
                      href={normalizeWebsiteUrl(organization.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      title="Перейти на сайт"
                    >
                      <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      {organization.website}
                    </a>
                  )}
                </div>
              )}
            </div>
            {!isEditing && (
              <div className="flex gap-2 flex-shrink-0 items-center">
                {/* История изменений: небольшая квадратная кнопка с закруглёнными
                    углами в общем стиле проекта, слева от «Редактировать».
                    Клик открывает модалку полной истории (снизу вверх, как везде). */}
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="flex items-center justify-center w-9 h-9 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                  title="История изменений"
                  aria-label="История изменений"
                >
                  <History className="w-4 h-4" />
                </button>
                {/* Права синхронизированы с бэкендом: редактирование организации — admin (PUT /api/organizations/:id).
                    Решение от 2026-11: МОЛ, системный администратор и пользователь организацию не редактируют. */}
                {canEditOrganization() && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30"
                  >
                    <Pencil className="w-4 h-4" /> Редактировать
                  </button>
                )}
                {/* Удаление организации — только admin */}
                {isAdmin() && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-transparent text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900/50 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                  >
                    <Trash2 className="w-4 h-4" /> Удалить
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600/50">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                <BadgeCheck className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">ИНН</span>
              </div>
              <p className="text-gray-800 dark:text-white font-semibold">{organization.inn}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600/50">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Пользователей</span>
              </div>
              <p className="text-gray-800 dark:text-white font-semibold">{memberCount}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600/50">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                <Briefcase className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Сотрудников</span>
              </div>
              <p className="text-gray-800 dark:text-white font-semibold">{employees.length}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600/50">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                <Monitor className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Единиц техники</span>
              </div>
              <p className="text-gray-800 dark:text-white font-semibold">{equipment.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="bg-red-900/30 border border-red-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-red-300 font-semibold">Удалить организацию?</h3>
            <p className="text-red-400/80 text-sm mt-1">
              Карточка организации «{organization.name}» будет удалена без возможности восстановления.
              Вы сможете создать новую организацию в любой момент.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
            >
              Отмена
            </button>
            <button
              onClick={async () => {
                setDeleting(true);
                setDeleteError(null);
                const ok = await deleteOrganization(organization.id);
                setDeleting(false);
                if (!ok) {
                  // storeError содержит текст причины от бэкенда (например, конфликт данных)
                  setDeleteError(storeError || 'Не удалось удалить организацию');
                  return;
                }
                setConfirmDelete(false);
                // После удаления бэкенд перевыпустил токен: если осталась другая
                // организация — на неё переключится скоуп и данные перезагрузятся
                // автоматически (useEffect в dataStore); редирект на главную.
                navigate('/dashboard');
              }}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-all disabled:opacity-60"
            >
              {deleting ? 'Удаление…' : 'Удалить'}
            </button>
          </div>
          {deleteError && (
            <div className="mt-3 px-4 py-2 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-sm">
              {deleteError}
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {isEditing && canEditOrganization() && (
        <EditOrganizationForm
          organization={organization}
          directorCandidates={[...employees].sort((a, b) => Number(b.isHeadEmployee ?? false) - Number(a.isHeadEmployee ?? false))}
          onClose={() => setIsEditing(false)}
          onSave={async (data) => {
            // Окно редактирования закрывается ТОЛЬКО если бэкенд принял изменения;
            // при ошибке форма остаётся открытой с введёнными данными.
            return await updateOrganization(organization.id, data);
          }}
        />
      )}

      {/* Details */}
      {!isEditing && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <InfoCard icon={BadgeCheck} title="Реквизиты">
              <InfoRow label="ИНН" value={organization.inn} />
              <InfoRow label="КПП" value={organization.kpp} />
              <InfoRow label="ОГРН / ОГРНИП" value={organization.ogrn} />
              <InfoRow label="Система налогообложения" value={organization.taxSystem} />
              <InfoRow label="Дата основания" value={formatDate(organization.foundedDate)} />
              <InfoRow label="Штатная численность" value={organization.employeeCount ?? undefined} />
            </InfoCard>

            {/* По требованию UI: в поле «Адрес и контакты» интерактив полностью
                отсутствует — адреса, телефоны, почта и сайт отображаются как
                статичный текст (без Яндекс-поиска, tel:, mailto: и ссылок). */}
            <InfoCard icon={MapPin} title="Адрес и контакты">
              <InfoRow label="Почтовый индекс" value={organization.postalCode} />
              <InfoRow label="Город" value={organization.city} />
              <InfoRow label="Юридический адрес" value={organization.legalAddress} />
              <InfoRow label="Фактический адрес" value={organization.actualAddress} />
              <InfoRow label="Телефон" value={organization.phone} />
              <InfoRow label="Email" value={organization.email} />
              <InfoRow label="Сайт" value={organization.website} />
            </InfoCard>

            <InfoCard icon={Crown} title="Руководство">
              {/* Должность руководителя отображается под ФИО */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:gap-4 py-1">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Руководитель</span>
                <span className="flex flex-col sm:items-end">
                  <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${organization.directorName?.trim() ? 'text-gray-800 dark:text-gray-200' : 'text-gray-600 italic'}`}>
                    {/* Золотая звёздочка руководителя организации */}
                    {organization.directorEmployeeId && <HeadStar />}
                    {organization.directorName?.trim() || 'не указан'}
                  </span>
                  {organization.directorPosition?.trim() && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{organization.directorPosition.trim()}</span>
                  )}
                </span>
              </div>
            </InfoCard>

            <InfoCard icon={Landmark} title="Банковские реквизиты">
              <InfoRow label="Наименование банка" value={organization.bankName} />
              <InfoRow label="Расчётный счёт" value={organization.checkingAccount} />
              <InfoRow label="Корреспондентский счёт" value={organization.correspondentAccount} />
              <InfoRow label="БИК" value={organization.bik} />
            </InfoCard>
          </div>

          {organization.notes && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-3">
                <Wallet className="w-4 h-4" /> Примечания
              </h3>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{organization.notes}</p>
            </div>
          )}

          {/* Блок «История изменений» внизу карточки убран по требованию UI:
              полная история открывается квадратной кнопкой с иконкой History
              в шапке карточки (слева от «Редактировать») — см. FullHistoryModal ниже. */}
        </>
      )}

      {/* Модалка полной истории изменений организации — открывается кнопкой в шапке.
          Рендерится на уровне страницы, чтобы гарантированно перекрывать контент (z-[70]). */}
      {historyOpen && (
        <FullHistoryModal
          history={orgHistory}
          title={`История изменений: ${organization.shortName || organization.name}`}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function EditOrganizationForm({
  organization,
  directorCandidates,
  onClose,
  onSave,
}: {
  organization: Organization;
  /** Сотрудники штатного расписания для выбора руководителя (руководитель — первым) */
  directorCandidates: Employee[];
  onClose: () => void;
  onSave: (data: Partial<Organization>) => Promise<boolean>;
}) {
  const positions = useDataStore((s) => s.positions);
  const [form, setForm] = useState({ ...organization });
  // Внутренняя валидация (общий стиль проекта): после нажатия «Сохранить»
  // незаполненные обязательные поля подсвечиваются красной рамкой с инлайн-
  // подсказкой; если данные не прошли проверку или бэкенд отклонил сохранение —
  // форма остаётся открытой (закрыть без сохранения можно «Отменой»/крестиком).
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const errCls = 'border-red-400 dark:border-red-600 focus:ring-red-400';

  const requiredFields: Array<{ key: keyof Organization; label: string; min?: number }> = [
    { key: 'shortName', label: 'Укажите краткое наименование (минимум 2 символа).', min: 2 },
    { key: 'name', label: 'Укажите полное наименование (минимум 3 символа).', min: 3 },
    { key: 'inn', label: 'ИНН обязателен для организации.' },
    { key: 'ogrn', label: 'ОГРН / ОГРНИП обязателен для организации.' },
    { key: 'postalCode', label: 'Укажите почтовый индекс.' },
    { key: 'legalAddress', label: 'Укажите юридический адрес.' },
  ];
  const fieldErr = (key: keyof Organization, min?: number): string | null => {
    if (!submitted) return null;
    const v = String((form as any)[key] ?? '').trim();
    if (!v) return requiredFields.find((f) => f.key === key)?.label ?? 'Поле обязательно для заполнения.';
    if (min && v.length < min) return requiredFields.find((f) => f.key === key)?.label ?? 'Слишком короткое значение.';
    return null;
  };

  const handleChange = (field: keyof Organization, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }) as any);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError(null);
    const hasErrors = requiredFields.some((f) => fieldErr(f.key, f.min));
    if (hasErrors) return;
    setSaving(true);
    // В payload — ТОЛЬКО записываемые поля формы. Раньше сюда попадали
    // computed-поля клиента (directorName/directorPosition/createdBy/
    // updatedBy/createdAt/updatedAt), из-за чего бэкенд отклонял запись и
    // кнопка «Сохранить» могла зависать в состоянии «Сохранение…».
    const payload: Record<string, unknown> = { ...form };
    for (const k of ['directorName', 'directorPosition', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'id']) {
      delete (payload as any)[k];
    }
    payload.name = String(payload.name ?? '').trim();
    payload.shortName = String(payload.shortName ?? '').trim();
    try {
      const ok = await onSave(payload as Partial<Organization>);
      if (!ok) {
        setSaveError('Не удалось сохранить организацию. Изменения НЕ применены — проверьте соединение и попробуйте ещё раз.');
      }
      // При успехе родитель закроет форму (setIsEditing(false)).
    } catch (err: any) {
      // Любая непредвиденная ошибка обязана разблокировать кнопку:
      // без этого форма навечно остаётся в состоянии «Сохранение…».
      setSaveError(err?.message || 'Не удалось сохранить организацию. Окно осталось открытым — данные сохранены в форме.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 border border-indigo-500/30 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Pencil className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Редактирование организации
        </h2>
        <button type="button" onClick={onClose} className="p-2 text-gray-400 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Порядок полей как в форме регистрации: сначала краткое, затем полное наименование */}
        <div className="md:col-span-2">
          <label className={labelCls}>Краткое наименование<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" value={form.shortName ?? ''} onChange={(e) => handleChange('shortName', e.target.value)} placeholder="ООО «Ромашка»" className={`${inputCls} ${fieldErr('shortName', 2) ? errCls : ''}`} />
          {fieldErr('shortName', 2) && <p className="text-xs text-red-500 mt-1">{fieldErr('shortName', 2)}</p>}
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Полное наименование<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} className={`${inputCls} ${fieldErr('name', 3) ? errCls : ''}`} />
          {fieldErr('name', 3) && <p className="text-xs text-red-500 mt-1">{fieldErr('name', 3)}</p>}
        </div>
        <div>
          <label className={labelCls}>Организационно-правовая форма<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          {/* ОПФ — свободное текстовое поле: формы вписываются вручную */}
          <input type="text" value={form.legalForm ?? ''} onChange={(e) => handleChange('legalForm', e.target.value)} placeholder="Например: ООО, АНО, ФГБУ…" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>ИНН<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" maxLength={12} value={form.inn} onChange={(e) => handleChange('inn', e.target.value.replace(/\D/g, ''))} className={`${inputCls} ${fieldErr('inn') ? errCls : ''}`} />
          {fieldErr('inn') && <p className="text-xs text-red-500 mt-1">{fieldErr('inn')}</p>}
        </div>
        <div>
          <label className={labelCls}>КПП</label>
          <input type="text" maxLength={9} value={form.kpp} onChange={(e) => handleChange('kpp', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>ОГРН / ОГРНИП<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" maxLength={15} value={form.ogrn} onChange={(e) => handleChange('ogrn', e.target.value.replace(/\D/g, ''))} className={`${inputCls} ${fieldErr('ogrn') ? errCls : ''}`} />
          {fieldErr('ogrn') && <p className="text-xs text-red-500 mt-1">{fieldErr('ogrn')}</p>}
        </div>
        <div>
          <label className={labelCls}>Система налогообложения</label>
          <input type="text" value={form.taxSystem} onChange={(e) => handleChange('taxSystem', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Почтовый индекс<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" maxLength={6} value={form.postalCode} onChange={(e) => handleChange('postalCode', e.target.value.replace(/\D/g, ''))} className={`${inputCls} ${fieldErr('postalCode') ? errCls : ''}`} />
          {fieldErr('postalCode') && <p className="text-xs text-red-500 mt-1">{fieldErr('postalCode')}</p>}
        </div>
        <div>
          <label className={labelCls}>Город</label>
          <input type="text" value={form.city} onChange={(e) => handleChange('city', e.target.value)} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Юридический адрес<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" value={form.legalAddress} onChange={(e) => handleChange('legalAddress', e.target.value)} className={`${inputCls} ${fieldErr('legalAddress') ? errCls : ''}`} />
          {fieldErr('legalAddress') && <p className="text-xs text-red-500 mt-1">{fieldErr('legalAddress')}</p>}
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Фактический адрес</label>
          <input type="text" value={form.actualAddress} onChange={(e) => handleChange('actualAddress', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Телефон</label>
          <input type="tel" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Сайт</label>
          <input type="text" value={form.website} onChange={(e) => handleChange('website', e.target.value)} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Руководитель</label>
          {/* Необязательное поле: руководитель выбирается из списка сотрудников
              штатного расписания (ФИО и должность синхронизирует бэкенд). */}
          <select
            value={form.directorEmployeeId ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, directorEmployeeId: e.target.value || null }) as any)}
            className={inputCls}
          >
            <option value="">Не указан</option>
            {directorCandidates.filter((emp) => emp.isEmployed).map((emp) => (
              <option key={emp.id} value={emp.id}>
                {(emp.isHeadEmployee ? '★ ' : '') + [emp.lastName, emp.firstName, emp.middleName].filter(Boolean).join(' ') + ' — ' + (positions.find((p) => p.id === emp.positionId)?.name ?? 'должность не указана')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Наименование банка</label>
          <input type="text" value={form.bankName} onChange={(e) => handleChange('bankName', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>БИК</label>
          <input type="text" maxLength={9} value={form.bik} onChange={(e) => handleChange('bik', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Расчётный счёт</label>
          <input type="text" maxLength={20} value={form.checkingAccount} onChange={(e) => handleChange('checkingAccount', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Корреспондентский счёт</label>
          <input type="text" maxLength={20} value={form.correspondentAccount} onChange={(e) => handleChange('correspondentAccount', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Дата основания</label>
          <input type="date" value={form.foundedDate} onChange={(e) => handleChange('foundedDate', e.target.value)} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Примечания</label>
          <textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} className={`${inputCls} min-h-[80px] resize-y`} />
        </div>
      </div>

      {saveError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {saveError}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-all disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" /> {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}

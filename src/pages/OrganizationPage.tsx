import { useState } from 'react';
import { useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { HistoryLog } from '../components/HistoryLog';
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
  CalendarDays,
} from 'lucide-react';
import type { Organization, OrganizationLegalForm } from '../types';


const inputCls =
  'w-full px-4 py-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none placeholder-gray-400 dark:placeholder-gray-500';
const labelCls = 'block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1';

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

function InfoCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
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

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  const empty = value === undefined || value === null || String(value).trim() === '';
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:gap-4 py-1">
      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium sm:text-right ${empty ? 'text-gray-600 italic' : 'text-gray-800 dark:text-gray-200'}`}>
        {empty ? 'не указан' : String(value)}
      </span>
    </div>
  );
}

export function OrganizationPage() {
  const navigate = useNavigate();
  const { currentUser, canEdit, switchOrganization } = useAuthStore();
  const { users } = useAuthStore();
  const { organizations, updateOrganization, deleteOrganization, employees, equipment, error: storeError } = useDataStore();

  const organization = currentUser?.organizationId
    ? organizations.find((o) => o.id === currentUser.organizationId)
    : undefined;
  const [switchingOrg, setSwitchingOrg] = useState(false);

  const handleSwitchOrg = async (orgId: string) => {
    if (!orgId || orgId === currentUser?.organizationId || switchingOrg) return;
    setSwitchingOrg(true);
    try {
      // authStore.switchOrganization перевыпускает JWT и обновляет currentUser;
      // dataStore сам перезагрузит данные уже новой активной организации.
      const res = await switchOrganization(orgId);
      if (!res.success) alert(res.error || 'Не удалось переключить организацию');
    } finally {
      setSwitchingOrg(false);
    }
  };
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!organization) {
    return <EmptyOrganizationState onCreate={() => navigate('/organization/create')} />;
  }

  const memberCount = users.filter((u) => u.organizationId === organization.id).length || 1;

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
              {/* Панель организаций: список всех доступных + переключение + создание новой.
                  Раньше «Создать организацию» была видна только при пустом списке —
                  вторую организацию создать было негде. */}
              {organizations.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {organizations.map((o) => {
                    const active = o.id === organization.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => handleSwitchOrg(o.id)}
                        disabled={active || switchingOrg}
                        title={active ? 'Активная организация' : 'Переключиться на эту организацию'}
                        className={
                          'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ' +
                          (active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/30 cursor-default'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300')
                        }
                      >
                        {o.shortName || o.name}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => navigate('/organization/create')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-indigo-400 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Создать организацию
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">{organization.name}</h1>
                <span className="px-3 py-1 bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-semibold">
                  {organization.legalForm || '—'}
                </span>
              </div>
              {organization.shortName && <p className="text-gray-500 dark:text-gray-400 mt-1">{organization.shortName}</p>}
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm text-gray-500 dark:text-gray-400">
                {(organization.city || organization.legalAddress) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    {[organization.postalCode, organization.city, organization.legalAddress].filter(Boolean).join(', ')}
                  </span>
                )}
                {organization.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    {organization.phone}
                  </span>
                )}
                {organization.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    {organization.email}
                  </span>
                )}
                {organization.website && (
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    {organization.website}
                  </span>
                )}
              </div>
            </div>
            {canEdit() && !isEditing && (
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30"
                >
                  <Pencil className="w-4 h-4" /> Редактировать
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-transparent text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900/50 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> Удалить
                </button>
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
      {isEditing && (
        <EditOrganizationForm
          organization={organization}
          onClose={() => setIsEditing(false)}
          onSave={(data) => {
            updateOrganization(organization.id, data);
            setIsEditing(false);
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
              <InfoRow label="Отрасль" value={organization.industry} />
              <InfoRow label="Дата основания" value={organization.foundedDate} />
              <InfoRow label="Штатная численность" value={organization.employeeCount ?? undefined} />
            </InfoCard>

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
              <InfoRow label="Руководитель" value={organization.directorName} />
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

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-4">
              <CalendarDays className="w-4 h-4" /> История изменений карточки
            </h3>
            <HistoryLog history={organization.history || []} />
          </div>
        </>
      )}
    </div>
  );
}

function EditOrganizationForm({
  organization,
  onClose,
  onSave,
}: {
  organization: Organization;
  onClose: () => void;
  onSave: (data: Partial<Organization>) => void;
}) {
  const [form, setForm] = useState({ ...organization });

  const handleChange = (field: keyof Organization, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }) as any);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return;
    onSave({ ...form, name: form.name.trim() });
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
        <div className="md:col-span-2">
          <label className={labelCls}>Полное наименование<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Организационно-правовая форма<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          {/* ОПФ — свободное текстовое поле: формы вписываются вручную */}
          <input type="text" value={form.legalForm ?? ''} onChange={(e) => handleChange('legalForm', e.target.value)} placeholder="Например: ООО, АНО, ФГБУ…" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Краткое наименование</label>
          <input type="text" value={form.shortName} onChange={(e) => handleChange('shortName', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>ИНН<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" maxLength={12} value={form.inn} onChange={(e) => handleChange('inn', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>КПП</label>
          <input type="text" maxLength={9} value={form.kpp} onChange={(e) => handleChange('kpp', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>ОГРН / ОГРНИП<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" maxLength={15} value={form.ogrn} onChange={(e) => handleChange('ogrn', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Система налогообложения</label>
          <input type="text" value={form.taxSystem} onChange={(e) => handleChange('taxSystem', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Почтовый индекс<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" maxLength={6} value={form.postalCode} onChange={(e) => handleChange('postalCode', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Город</label>
          <input type="text" value={form.city} onChange={(e) => handleChange('city', e.target.value)} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Юридический адрес<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
          <input type="text" value={form.legalAddress} onChange={(e) => handleChange('legalAddress', e.target.value)} className={inputCls} />
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
        <div>
          <label className={labelCls}>Отрасль</label>
          <input type="text" value={form.industry} onChange={(e) => handleChange('industry', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Руководитель</label>
          <input type="text" value={form.directorName} onChange={(e) => handleChange('directorName', e.target.value)} className={inputCls} />
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

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-all"
        >
          Отмена
        </button>
        <button
          type="submit"
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30"
        >
          <Save className="w-4 h-4" /> Сохранить
        </button>
      </div>
    </form>
  );
}

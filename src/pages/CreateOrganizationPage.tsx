import { useState } from 'react';
import { useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { useDataStore } from '../store/dataStore';
import { Building2, ArrowLeft, Save, Eye, EyeOff } from 'lucide-react';

const taxSystems = [
  'ОСНО (общая система налогообложения)',
  'УСН Доходы (6%)',
  'УСН Доходы минус расходы (15%)',
  'ПСН (патентная система)',
  'ЕСХН (единый сельскохозяйственный налог)',
  'НПД (налог на профессиональный доход)',
];

const inputCls =
  'w-full px-4 py-3 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none placeholder-gray-500';
const labelCls = 'block text-sm font-medium text-gray-300 mb-1';

export function CreateOrganizationPage() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const currentUser = useAuthStore((s) => s.currentUser);
  const hasOrganization = useAuthStore((s) => s.hasOrganization);
  const addOrganization = useDataStore((s) => s.addOrganization);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    // ОПФ выбирается из списка типовых форм; через select со значением
    // «Другое…» можно ввести любую форму вручную (поле legalFormCustom).
    legalForm: 'ООО',
    legalFormCustom: '',
    shortName: '',
    inn: '',
    kpp: '',
    ogrn: '',
    postalCode: '',
    city: '',
    legalAddress: '',
    actualAddress: '',
    phone: '',
    email: '',
    website: '',
    directorName: '',
    bankName: '',
    checkingAccount: '',
    correspondentAccount: '',
    bik: '',
    taxSystem: taxSystems[0],
    industry: '',
    employeeCount: '',
    foundedDate: '',
    notes: '',
  });

  // Если у пользователя уже есть организация — не даём создавать вторую
  if (currentUser && hasOrganization()) {
    navigate('/organization', { replace: true });
    return null;
  }

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');

    if (form.name.trim().length < 3) {
      setError('Укажите полное наименование организации (минимум 3 символа)');
      return;
    }
    if (form.inn.trim().length !== 10 && form.inn.trim().length !== 12) {
      setError('ИНН должен содержать 10 (юридическое лицо) или 12 (физическое лицо/ИП) цифр');
      return;
    }
    if (!form.legalForm.trim() && !form.legalFormCustom.trim()) {
      setError('Укажите организационно-правовую форму');
      return;
    }
    if (form.ogrn.trim().length === 0) {
      setError('Укажите ОГРН / ОГРНИП');
      return;
    }
    if (!/^\d{6}$/.test(form.postalCode.trim())) {
      setError('Укажите почтовый индекс — 6 цифр');
      return;
    }
    if (form.legalAddress.trim().length < 5) {
      setError('Укажите юридический адрес');
      return;
    }

    const finalLegalForm = (form.legalForm === 'Другое…' ? form.legalFormCustom : form.legalForm).trim();

    setSaving(true);
    let org = null;
    try {
      org = await addOrganization({
        name: form.name.trim(),
        legalForm: finalLegalForm,
        shortName: form.shortName.trim() || form.name.trim(),
        inn: form.inn.trim(),
        kpp: form.kpp.trim(),
        ogrn: form.ogrn.trim(),
        legalAddress: form.legalAddress.trim(),
        actualAddress: form.actualAddress.trim(),
        postalCode: form.postalCode.trim(),
        city: form.city.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim(),
        directorName: form.directorName.trim(),
        bankName: form.bankName.trim(),
        checkingAccount: form.checkingAccount.trim(),
        correspondentAccount: form.correspondentAccount.trim(),
        bik: form.bik.trim(),
        taxSystem: form.taxSystem,
        industry: form.industry.trim(),
        employeeCount: form.employeeCount ? Number(form.employeeCount) : null,
        foundedDate: form.foundedDate,
        logo: undefined,
        notes: form.notes.trim(),
      });
    } finally {
      setSaving(false);
    }

    if (org) {
      // Обновляем профиль пользователя с сервера: именно поле organizationId
      // в currentUser решает, пускать ли пользователя в приложение. Без этого
      // шага guard-редиректы считали пользователя «без организации».
      try { await bootstrap(); } catch { /* не критично */ }
      navigate('/organization', { replace: true });
    } else {
      setError('Не удалось создать организацию. Проверьте заполнение полей и повторите.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 hover:text-white hover:bg-gray-700 transition-all"
            title="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-500 rounded-2xl shadow-xl shadow-indigo-500/30">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Создание организации</h1>
            <p className="text-slate-400 mt-1">
              Добро пожаловать, {currentUser?.fullName?.split(' ')[1] || currentUser?.fullName}! Заполните карточку вашей организации, чтобы начать учёт активов.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Основные сведения */}
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-700">
            <h2 className="text-lg font-bold text-indigo-400 mb-5 flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Основные сведения
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Полное наименование<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className={inputCls}
                  placeholder='Общество с ограниченной ответственностью «Ромашка»'
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Организационно-правовая форма<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
                <select
                  value={form.legalForm}
                  onChange={(e) => handleChange('legalForm', e.target.value)}
                  className={inputCls}
                >
                  {['ООО', 'АО', 'ПАО', 'ИП', 'ГП', 'АНО', 'ФГБУ', 'МБУ', 'Другое…'].map((lf) => (
                    <option key={lf} value={lf}>{lf}</option>
                  ))}
                </select>
                {form.legalForm === 'Другое…' && (
                  <input
                    type="text"
                    value={form.legalFormCustom}
                    onChange={(e) => handleChange('legalFormCustom', e.target.value)}
                    className={`${inputCls} mt-2`}
                    placeholder="Укажите ОПФ вручную, например: ТСН, КФХ, НКО…"
                    required
                  />
                )}
              </div>
              <div>
                <label className={labelCls}>Краткое наименование</label>
                <input
                  type="text"
                  value={form.shortName}
                  onChange={(e) => handleChange('shortName', e.target.value)}
                  className={inputCls}
                  placeholder="ООО «Ромашка»"
                />
              </div>
              <div>
                <label className={labelCls}>Отрасль / вид деятельности</label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => handleChange('industry', e.target.value)}
                  className={inputCls}
                  placeholder="IT, производство, торговля…"
                />
              </div>
              <div>
                <label className={labelCls}>Дата основания</label>
                <input
                  type="date"
                  value={form.foundedDate}
                  onChange={(e) => handleChange('foundedDate', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Реквизиты */}
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-700">
            <h2 className="text-lg font-bold text-indigo-400 mb-5 flex items-center gap-2">
              <Eye className="w-5 h-5" /> Реквизиты
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>ИНН<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span> {form.legalForm === 'ИП' ? '(12 цифр)' : '(10 цифр)'}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={form.inn}
                  onChange={(e) => handleChange('inn', e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                  placeholder={form.legalForm === 'ИП' ? '12 цифр' : '10 цифр'}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>КПП (не обязателен)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={9}
                  value={form.kpp}
                  onChange={(e) => handleChange('kpp', e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                  placeholder="9 цифр"
                />
              </div>
              <div>
                <label className={labelCls}>ОГРН / ОГРНИП<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={15}
                  value={form.ogrn}
                  onChange={(e) => handleChange('ogrn', e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                  placeholder="13 или 15 цифр"
                  required
                />
              </div>
              <div className="md:col-span-3">
                <label className={labelCls}>Система налогообложения</label>
                <select
                  value={form.taxSystem}
                  onChange={(e) => handleChange('taxSystem', e.target.value)}
                  className={inputCls}
                >
                  {taxSystems.map((ts) => (
                    <option key={ts} value={ts}>
                      {ts}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Адрес и контакты */}
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-700">
            <h2 className="text-lg font-bold text-indigo-400 mb-5 flex items-center gap-2">
              <EyeOff className="w-5 h-5" /> Адрес и контакты
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Почтовый индекс<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                  placeholder="101000"
                />
              </div>
              <div>
                <label className={labelCls}>Город</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className={inputCls}
                  placeholder="г. Москва"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Юридический адрес<span className="text-red-500 ml-0.5" title="Обязательное поле">*</span></label>
                <input
                  type="text"
                  value={form.legalAddress}
                  onChange={(e) => handleChange('legalAddress', e.target.value)}
                  className={inputCls}
                  placeholder="ул. Ленина, д. 1, офис 100"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Фактический адрес</label>
                <input
                  type="text"
                  value={form.actualAddress}
                  onChange={(e) => handleChange('actualAddress', e.target.value)}
                  className={inputCls}
                  placeholder="Если отличается от юридического"
                />
              </div>
              <div>
                <label className={labelCls}>Контактный телефон</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className={inputCls}
                  placeholder="+7 (495) 123-45-67"
                />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className={inputCls}
                  placeholder="example: info@org.ru"
                />
              </div>
              <div>
                <label className={labelCls}>Сайт</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  className={inputCls}
                  placeholder="example: https://org.ru"
                />
              </div>
              <div>
                <label className={labelCls}>Штатная численность</label>
                <input
                  type="number"
                  min={0}
                  value={form.employeeCount}
                  onChange={(e) => handleChange('employeeCount', e.target.value)}
                  className={inputCls}
                  placeholder="например, 50"
                />
              </div>
            </div>
          </div>

          {/* Руководство и банк */}
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-700">
            <h2 className="text-lg font-bold text-indigo-400 mb-5 flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Руководство и банковские реквизиты
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Руководитель (ФИО / должность)</label>
                <input
                  type="text"
                  value={form.directorName}
                  onChange={(e) => handleChange('directorName', e.target.value)}
                  className={inputCls}
                  placeholder="Директор Иванов И. И."
                />
              </div>
              {/* Главный бухгалтер убран из карточки организации: он определяется
                  по штатному расписанию среди сотрудников (справочники → должности). */}
              <div>
                <label className={labelCls}>Наименование банка</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => handleChange('bankName', e.target.value)}
                  className={inputCls}
                  placeholder="ПАО «Сбербанк»"
                />
              </div>
              <div>
                <label className={labelCls}>БИК</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={9}
                  value={form.bik}
                  onChange={(e) => handleChange('bik', e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                  placeholder="044525225"
                />
              </div>
              <div>
                <label className={labelCls}>Расчётный счёт</label>
                <input
                  type="text"
                  maxLength={20}
                  value={form.checkingAccount}
                  onChange={(e) => handleChange('checkingAccount', e.target.value)}
                  className={inputCls}
                  placeholder="40702810000000000000"
                />
              </div>
              <div>
                <label className={labelCls}>Корреспондентский счёт</label>
                <input
                  type="text"
                  maxLength={20}
                  value={form.correspondentAccount}
                  onChange={(e) => handleChange('correspondentAccount', e.target.value)}
                  className={inputCls}
                  placeholder="30101810400000000225"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Примечания</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className={`${inputCls} min-h-[80px] resize-y`}
                  placeholder="Дополнительная информация об организации"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end pb-8">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 rounded-xl font-medium text-gray-300 bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-all"
            >
              Отложить
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Создание…' : 'Создать организацию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

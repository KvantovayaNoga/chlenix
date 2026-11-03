import { useEffect, useState } from 'react';
import { Link, useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import { Building2, UserPlus, Eye, EyeOff, ArrowRight, ShieldCheck, Clock, Users2 } from 'lucide-react';

interface PublicOrg {
  id: string;
  shortName: string;
}

export function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    createOrganization: false,
  });
  // Чекбоксы «Присоединиться…» (слева) и «Создать организацию…» (справа) —
  // взаимоисключающие: выбор одного снимает другой. По умолчанию выбрана
  // опция «Присоединиться к организации» (если в системе есть организации).
  const [joinMode, setJoinMode] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [publicOrgs, setPublicOrgs] = useState<PublicOrg[]>([]);
  // Есть ли в системе активный администратор (из публичного эндпоинта):
  // если нет — регистрируется первый пользователь (будущий админ),
  // он входит сразу; все остальные — только через заявку на доступ.
  const [hasAdmin, setHasAdmin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pendingJoin, setPendingJoin] = useState<{ organization: string } | null>(null);
  const { register } = useAuthStore();
  // Первый пользователь — тот, после кого в системе ещё нет активного
  // администратора (проверка на бэкенде: userCount === 0). Список /users
  // недоступен без авторизации, поэтому опираемся на флаг hasAdmin из
  // публичного эндпоинта и на отсутствие организаций.
  const isFirstUser = !hasAdmin && publicOrgs.length === 0;
  // Выбор режима регистрации («Присоединиться» / «Создать») показываем только
  // когда в системе уже есть организации и это не первый пользователь.
  // Если организаций нет — пользователь после первого входа сам создаст
  // организацию, без навязывания выбора и редиректа на её создание.
  const showModeSelection = !isFirstUser && publicOrgs.length > 0;
  const navigate = useNavigate();

  // Публичный эндпоинт GET /api/public/organizations отдаёт список организаций
  // (только id + shortName) и флаг hasAdmin — есть ли активный администратор.
  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ organizations: PublicOrg[]; hasAdmin: boolean }>('/public/organizations');
        setPublicOrgs(res.organizations ?? []);
        setHasAdmin(!!res.hasAdmin);
        // Если организаций в системе нет — выбор «Присоединиться»/«Создать»
        // не показываем: пользователь после первого входа сам создаст
        // организацию, сразу на её создание редиректить не нужно.
        if ((res.organizations ?? []).length === 0) setJoinMode(false);
      } catch {
        setJoinMode(false);
        setError('Не удалось загрузить список организаций. Попробуйте позже.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Первый пользователь — администратор системы: присоединяться не к чему,
    // режим «Присоединиться» снимаем автоматически.
    if (isFirstUser) setJoinMode(false);
  }, [isFirstUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (formData.password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    if (joinMode && publicOrgs.length > 0 && !selectedOrgId) {
      setError('Выберите организацию, к которой хотите присоединиться');
      return;
    }

    const result = await register(formData.email, formData.password, formData.fullName, joinMode ? selectedOrgId : null);
    if (!result.success) {
      setError(result.error || 'Ошибка регистрации');
      return;
    }
    if (result.pendingJoin) {
      // Аккаунт создан, заявка на доступ отправлена администратору системы.
      // Пользователь НЕ авторизован до одобрения заявки — экран ожидания.
      const org = publicOrgs.find((o) => o.id === selectedOrgId);
      setPendingJoin({ organization: result.pendingJoinOrganization ?? org?.shortName ?? 'организации' });
      return;
    }
    // Первый пользователь (администратор системы): вход выполнен сразу.
    navigate('/dashboard');
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Экран ожидания одобрения заявки
  if (pendingJoin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-slate-100 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl mb-4 shadow-xl shadow-amber-500/30">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Заявка отправлена</h1>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700 text-left">
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              Аккаунт создан. Доступ к организации{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">«{pendingJoin.organization}»</span>{' '}
              будет предоставлен после одобрения заявки администратором системы. Он же назначит вашу роль и права доступа.
            </p>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mt-3">
              После одобрения войдите в систему под своим email и паролем.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="mt-6 w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
            >
              Перейти на страницу входа
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-slate-100 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-500 rounded-2xl mb-4 shadow-xl shadow-indigo-500/30">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Chlenix</h1>
          <p className="text-slate-400 mt-2">Регистрация в системе</p>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-200 mb-2">Создать аккаунт</h2>
          {isFirstUser && (
            <div className="mb-5 p-3 bg-indigo-900/30 border border-indigo-700/60 rounded-xl text-indigo-200 text-sm flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
              Вы первый пользователь в системе — после регистрации вы автоматически получите роль администратора организации.
            </div>
          )}
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 flex items-start gap-2">
            <ArrowRight className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
            {showModeSelection
              ? 'Присоединитесь к существующей организации или создайте новую — карточку организации можно создать и позже.'
              : isFirstUser
                ? 'После входа в систему вы сможете создать свою организацию и начать учёт активов.'
                : 'После регистрации будет создана заявка на доступ. Войти в систему можно только после её одобрения администратором.'}
          </p>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                ФИО
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Иванов Иван Иванович"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none pr-12 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Минимум 6 символов"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Подтверждение пароля
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Повторите пароль"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 mt-6"
            >
              <UserPlus className="w-5 h-5" />
              Зарегистрироваться
            </button>

            {/* Чекбоксы режима: слева — присоединиться к существующей,
                справа — создать организацию после регистрации (взаимоисключающие).
                Показываются только если в системе есть организации. */}
            {showModeSelection && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <label
                className={`flex flex-col gap-1.5 p-3 border rounded-xl cursor-pointer transition-colors ${
                  joinMode
                    ? 'bg-indigo-900/30 border-indigo-600'
                    : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={joinMode}
                    onChange={(e) => {
                      setJoinMode(e.target.checked);
                      if (!e.target.checked) setSelectedOrgId(null);
                      // Взаимоисключение: «присоединиться» отменяет «создать организацию»
                      setFormData((prev) => ({ ...prev, createOrganization: e.target.checked ? false : true }));
                    }}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-200">
                    <Users2 className="w-4 h-4 text-indigo-400" />
                    Присоединиться к существующей организации
                  </span>
                </span>
                <span className="text-xs text-gray-400">
                  Заявка на вступление будет отправлена администратору системы.
                </span>
              </label>

              <label
                className={`flex flex-col gap-1.5 p-3 border rounded-xl transition-colors ${formData.createOrganization && !isFirstUser ? 'cursor-pointer' : 'cursor-default opacity-60'} ${
                  formData.createOrganization && !joinMode
                    ? 'bg-indigo-900/30 border-indigo-600'
                    : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.createOrganization && !joinMode}
                    disabled={joinMode || isFirstUser}
                    onChange={(e) => setFormData((prev) => ({ ...prev, createOrganization: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-200">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    Создать организацию после регистрации
                  </span>
                </span>
                <span className="text-xs text-gray-400">
                  Карточку организации можно будет создать и позже — в разделе «Организация».
                </span>
              </label>
            </div>
            )}

            {/* Список организаций для выбора (только краткие наименования) */}
            {showModeSelection && joinMode && (
              <div className="mt-3 p-3 bg-gray-700/50 border border-gray-600 rounded-xl">
                <p className="text-xs font-medium text-gray-300 mb-2">Выберите организацию:</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {publicOrgs.map((org) => (
                    <label
                      key={org.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        selectedOrgId === org.id ? 'bg-indigo-600/30 text-indigo-200' : 'hover:bg-gray-600/50 text-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedOrgId === org.id}
                        onChange={(e) => setSelectedOrgId(e.target.checked ? org.id : null)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm">{org.shortName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Уже есть аккаунт?{' '}
              <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

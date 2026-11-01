import { useState } from 'react';
import { useNavigate } from '../router';
import { useAuthStore } from '../store/authStore';
import { Building2, MapPin, Phone, Hash, Crown, Check, ArrowLeft, Plus } from 'lucide-react';

/**
 * Страница «Сменить организацию».
 * Открывается по кнопке из сайдбара (над текущей организацией).
 * Показывает карточки всех доступных организаций с краткими реквизитами:
 * название, адрес, телефон, ИНН, руководитель. Клик по чужой карточке — переключение.
 */
export function SwitchOrganizationPage() {
  const navigate = useNavigate();
  const { currentUser, myOrganizations, switchOrganization } = useAuthStore();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgs = myOrganizations();
  const activeId = currentUser?.organizationId;

  const handleSelect = async (orgId: string) => {
    if (!orgId || orgId === activeId || switching) return;
    setSwitching(true);
    setError(null);
    try {
      // switchOrganization перевыпускает JWT и обновляет currentUser;
      // dataStore сам перезагрузит данные уже новой активной организации.
      const res = await switchOrganization(orgId);
      if (res.success) {
        navigate('/organization');
      } else {
        setError(res.error || 'Не удалось переключить организацию');
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Сменить организацию</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Выберите организацию для работы — данные, справочники и отчёты изолированы по организации.
          </p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {orgs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-600 dark:text-slate-300 font-medium">У вас пока нет организаций</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Сначала создайте первую организацию.</p>
          <button
            onClick={() => navigate('/organization/create')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Создать организацию
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orgs.map((org) => {
            const active = org.id === activeId;
            return (
              <button
                key={org.id}
                onClick={() => handleSelect(org.id)}
                disabled={active || switching}
                className={
                  'text-left bg-white dark:bg-gray-800 rounded-2xl border p-5 transition-all ' +
                  (active
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30 cursor-default'
                    : 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-500/10')
                }
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-gray-800 dark:text-white truncate">{org.name}</h2>
                      {active && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-xs font-semibold whitespace-nowrap">
                          <Check className="w-3 h-3" /> Активная
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 space-y-1.5 text-sm text-gray-500 dark:text-gray-400">
                      {(org.legalAddress || org.shortName) && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{org.legalAddress || org.shortName}</span>
                        </div>
                      )}
                      {org.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 flex-shrink-0" />
                          <span>{org.phone}</span>
                        </div>
                      )}
                      {org.inn && (
                        <div className="flex items-center gap-2">
                          <Hash className="w-4 h-4 flex-shrink-0" />
                          <span>ИНН {org.inn}</span>
                        </div>
                      )}
                      {org.directorName && (
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{org.directorName}</span>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Создание новой организации доступно со страницы выбора */}
      <div className="flex justify-center pt-2">
        <button
          onClick={() => navigate('/organization/create')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-indigo-400 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Создать новую организацию
        </button>
      </div>
    </div>
  );
}

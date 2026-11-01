import { Shield, ShieldCheck, Eye, Cpu, Database, Server, Users, Building2 } from 'lucide-react';
import type { UserRole } from '../types';
import { useDataStore } from '../store/dataStore';

// Версия приложения: единый источник — package.json (подставляется Vite при сборке).
const APP_VERSION: string =
  (import.meta as unknown as { env?: { VITE_APP_VERSION?: string } }).env?.VITE_APP_VERSION ?? '0.12';

const roleLabels: Record<UserRole, string> = {
  admin: 'Администратор',
  materially_responsible: 'Материально ответственное лицо',
  viewer: 'Пользователь',
};

const roleDescriptions: Record<UserRole, string> = {
  admin: 'Полный доступ ко всем функциям системы: просмотр, редактирование, управление пользователями, настройка справочников.',
  materially_responsible: 'Доступ к просмотру и редактированию данных о сотрудниках, оборудовании, физических серверах и виртуальных машинах.',
  viewer: 'Доступ только для просмотра информации. Не может вносить изменения в данные.',
};

const roleIcons: Record<UserRole, React.ElementType> = {
  admin: ShieldCheck,
  materially_responsible: Shield,
  viewer: Eye,
};

const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  materially_responsible: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  viewer: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

export function AboutPage() {
  // Реальные счётчики из данных текущей организации (без хардкода).
  const { employees, equipment, virtualMachines, organizations } = useDataStore();
  const physicalServers = equipment.filter((e) => e.category === 'server').length;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">О системе</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Информация о Chlenix и ролях доступа</p>
      </div>

      {/* О системе */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg">
            <Cpu className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Chlenix</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Версия {APP_VERSION}</p>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Chlenix — современная система учёта ИТ-активов, сотрудников и виртуальной инфраструктуры. 
          Предназначена для централизованного управления оборудованием, виртуальными машинами и сотрудниками организации.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mb-2" />
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{organizations.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Организаций</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-2" />
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{employees.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Сотрудников</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <Server className="w-5 h-5 text-red-600 dark:text-red-400 mb-2" />
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{physicalServers}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Физ. серверов</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400 mb-2" />
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{virtualMachines.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Виртуальных машин</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <Database className="w-5 h-5 text-green-600 dark:text-green-400 mb-2" />
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{equipment.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Единиц оборудования</p>
          </div>
        </div>
      </div>

      {/* Роли доступа */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Роли доступа</h2>
        <div className="space-y-4">
          {(Object.entries(roleLabels) as [UserRole, string][]).map(([role, label]) => {
            const Icon = roleIcons[role];
            return (
              <div key={role} className={`p-5 rounded-lg border ${roleColors[role]}`}>
                <div className="flex items-start gap-4">
                  <div className="bg-white/50 dark:bg-black/20 p-3 rounded-lg">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{label}</h3>
                    <p className="text-sm opacity-90">{roleDescriptions[role]}</p>
                    <div className="mt-3 pt-3 border-t border-current/20">
                      <p className="text-xs font-medium mb-2">Права доступа:</p>
                      <ul className="text-xs space-y-1 opacity-80">
                        {role === 'admin' && (
                          <>
                            <li>✓ Полный доступ ко всем разделам</li>
                            <li>✓ Управление пользователями</li>
                            <li>✓ Редактирование всех данных</li>
                            <li>✓ Настройка справочников</li>
                            <li>✓ Просмотр дат создания учётных записей</li>
                          </>
                        )}
                        {role === 'materially_responsible' && (
                          <>
                            <li>✓ Просмотр всех разделов</li>
                            <li>✓ Редактирование сотрудников</li>
                            <li>✓ Редактирование оборудования</li>
                            <li>✓ Управление серверами и ВМ</li>
                            <li>✗ Управление пользователями</li>
                          </>
                        )}
                        {role === 'viewer' && (
                          <>
                            <li>✓ Просмотр всех разделов</li>
                            <li>✗ Редактирование данных</li>
                            <li>✗ Управление пользователями</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Технологии */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Технологии</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Frontend</h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• React 19 + TypeScript 5.x</li>
              <li>• Vite 6</li>
              <li>• Tailwind CSS 4</li>
              <li>• Собственный лёгкий роутер (без react-router)</li>
              <li>• React Context + hooks (store: dataStore / authStore) — без Zustand</li>
              <li>• Lucide React (иконки)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Backend</h3>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Node.js 22 + Hono</li>
              <li>• Prisma ORM + PostgreSQL 16</li>
              <li>• JWT-авторизация, роли и мультиорганизационность</li>
              <li>• Docker Compose + nginx (SPA + прокси API)</li>
              <li>• Zod-валидация на обоих концах</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

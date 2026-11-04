// ============================================================
// Раздел «Администрирование» (только администратор системы).
// Пока содержит единственную функцию — заявки пользователей на вступление
// в организации (создаются при регистрации с чекбоксом
// «Присоединиться к существующей организации»).
// При одобрении администратор назначает роль — пользователь сразу
// привязывается к организации с соответствующими правами доступа.
// Эндпоинты: GET /api/join-requests, POST /api/join-requests/:id/approve|reject
// (на бэкенде закрыты requireRole(['admin'])).
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { ROLE_LABELS, type UserRole } from '../types';
import { Inbox, Check, X, ShieldCheck, Clock, Users2, Building2, Mail, Bug } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatDateTime } from '../utils/formatDate';

interface JoinRequestItem {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  assignedRole: string | null;
  createdAt: string;
  applicant: { id: string; fullName: string; email: string };
  organization: { id: string; name: string; shortName: string | null };
  approver: { id: string; fullName: string } | null;
}

type StatusFilter = 'pending' | 'approved' | 'rejected';

// Роли, которые можно выдать при одобрении (синхронизировано с
// ASSIGNABLE_JOIN_ROLES в backend/src/index.ts — все роли, включая администратора)
const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'viewer', 'materially_responsible', 'hr_specialist', 'sysadmin'];

const statusLabels: Record<StatusFilter, string> = {
  pending: 'Новые',
  approved: 'Одобренные',
  rejected: 'Отклонённые',
};

export function AdminPanelPage() {
  // Имитация роли (отладка интерфейса): доступно только настоящему администратору.
  // Меняет ТОЛЬКО вид UI (кнопки/разделы/гарды маршрутов), не JWT и не права на сервере.
  const { impersonatedRole, setImpersonatedRole } = useAuthStore();
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [requests, setRequests] = useState<JoinRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Выбранная роль для каждой заявки (по умолчанию — «Пользователь»)
  const [roleChoice, setRoleChoice] = useState<Record<string, UserRole>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    setError('');
    try {
      const list = await api.get<JoinRequestItem[]>(`/join-requests?status=${status}`);
      setRequests(list);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Сервер недоступен');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const handleApprove = async (req: JoinRequestItem) => {
    setBusyId(req.id);
    setFeedback(null);
    try {
      const role = roleChoice[req.id] ?? 'viewer';
      await api.post(`/join-requests/${req.id}/approve`, { role });
      setFeedback({
        type: 'success',
        text: `${req.applicant.fullName} добавлен(а) в организацию «${req.organization.shortName || req.organization.name}», роль — «${ROLE_LABELS[role]}».`,
      });
      await load(filter);
    } catch (e) {
      setFeedback({ type: 'error', text: e instanceof ApiError ? e.message : 'Не удалось одобрить заявку' });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: JoinRequestItem) => {
    if (!confirm(`Отклонить заявку от ${req.applicant.fullName}? Пользователь останется без организации.`)) return;
    setBusyId(req.id);
    setFeedback(null);
    try {
      await api.post(`/join-requests/${req.id}/reject`, {});
      setFeedback({ type: 'success', text: `Заявка от ${req.applicant.fullName} отклонена.` });
      await load(filter);
    } catch (e) {
      setFeedback({ type: 'error', text: e instanceof ApiError ? e.message : 'Не удалось отклонить заявку' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-700 dark:text-gray-200 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-indigo-500" />
          Администрирование
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Заявки пользователей на вступление в организации. При одобрении выберите роль —
          пользователь будет сразу привязан к организации с соответствующими правами доступа.
        </p>
      </div>

      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${feedback.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'}`}>
          <div className="flex items-center justify-between gap-4">
            <span>{feedback.text}</span>
            <button onClick={() => setFeedback(null)} className="shrink-0 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* ── Отладка: имитация другой роли ──────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 p-6">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-1">
          <Bug className="w-5 h-5 text-orange-500" />
          Имитация роли
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Выберите роль, чтобы увидеть интерфейс так, как его видит пользователь с этой ролью.
          Это только отладка интерфейса: запросы к серверу выполняются с вашей настоящей ролью
          администратора, поэтому реальные права не меняются. Для возврата нажмите «Админка»
          в сайдбаре (или «Вернуть интерфейс администратора» ниже).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setImpersonatedRole(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!impersonatedRole ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
          >
            {impersonatedRole ? 'Вернуть интерфейс администратора' : 'Администратор (текущий режим)'}
          </button>
          {(['hr_specialist', 'sysadmin', 'materially_responsible', 'viewer'] as UserRole[]).map((r) => (
            <button
              key={r}
              onClick={() => setImpersonatedRole(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${impersonatedRole === r ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        {impersonatedRole && (
          <p className="mt-3 text-sm text-orange-600 dark:text-orange-400">
            Сейчас вы видите интерфейс роли «{ROLE_LABELS[impersonatedRole]}». Кнопка «Админка» внизу сайдбара вернёт вас сюда.
          </p>
        )}
      </div>

      {/* Фильтры по статусу */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          {(Object.keys(statusLabels) as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${filter === s ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              {s === 'pending' ? <Clock className="w-5 h-5" /> : <Inbox className="w-5 h-5" />}
              {statusLabels[s]}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Загрузка заявок…</p>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">{error}</p>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center text-gray-500 dark:text-gray-400">
              <Users2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Заявок в категории «{statusLabels[filter]}» нет.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      {req.applicant.fullName}
                      {req.status !== 'pending' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                          {req.status === 'approved' ? 'одобрена' : 'отклонена'}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3.5 h-3.5" /> {req.applicant.email}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                      <Building2 className="w-3.5 h-3.5" /> Организация: {req.organization.shortName || req.organization.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Заявка от {formatDateTime(req.createdAt)}
                      {req.status === 'approved' && req.assignedRole ? ` · роль: ${ROLE_LABELS[req.assignedRole as UserRole] ?? req.assignedRole}` : ''}
                      {req.approver ? ` · обработал: ${req.approver.fullName}` : ''}
                    </p>
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex items-center gap-3 shrink-0">
                      <select
                        value={roleChoice[req.id] ?? 'viewer'}
                        onChange={(e) => setRoleChoice((prev) => ({ ...prev, [req.id]: e.target.value as UserRole }))}
                        className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        title="Роль, которая будет выдана при одобрении"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => void handleApprove(req)}
                        disabled={busyId === req.id}
                        className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" /> Одобрить
                      </button>
                      <button
                        onClick={() => void handleReject(req)}
                        disabled={busyId === req.id}
                        className="flex items-center gap-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/40 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> Отклонить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

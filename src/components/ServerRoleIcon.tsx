import { Layers, Server, HardDrive, TerminalSquare } from 'lucide-react';
import type { ServerRole } from '../types';

/**
 * Единая иконка для роли в системе виртуализации — используется ВЕЗДЕ:
 * физические серверы, платформа виртуализации, карточки, заголовки секций.
 * Косяк 2 (пункт про разные иконки СХД в разных разделах).
 */
const roleIconMap: Record<string, { Icon: typeof Server; bg: string; color: string }> = {
  cluster:             { Icon: Layers,        bg: 'bg-purple-50 dark:bg-purple-900/30',   color: 'text-purple-600 dark:text-purple-400' },
  hypervisor_host:     { Icon: Server,        bg: 'bg-red-50 dark:bg-red-900/30',         color: 'text-red-600 dark:text-red-400' },
  storage:             { Icon: HardDrive,     bg: 'bg-cyan-50 dark:bg-cyan-900/30',       color: 'text-cyan-600 dark:text-cyan-400' },
  management_console:  { Icon: TerminalSquare,bg: 'bg-amber-50 dark:bg-amber-900/30',     color: 'text-amber-600 dark:text-amber-400' },
};

const fallback = { Icon: Server, bg: 'bg-red-50 dark:bg-red-900/30', color: 'text-red-600 dark:text-red-400' };

export function serverRoleVisual(role?: ServerRole | string | null) {
  return roleIconMap[role || ''] || fallback;
}

export function ServerRoleIcon({ role, className = 'w-6 h-6', boxClassName = 'p-3 rounded-lg' }: {
  role?: ServerRole | string | null;
  className?: string;
  boxClassName?: string;
}) {
  const { Icon, bg, color } = serverRoleVisual(role);
  return (
    <div className={`${bg} ${boxClassName}`}>
      <Icon className={`${className} ${color}`} />
    </div>
  );
}

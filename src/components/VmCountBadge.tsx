import { Monitor } from 'lucide-react';

/**
 * Кликабельный счётчик ВМ («ВМ: N») в стиле активных пунктов меню сайдбара:
 * рамка, подсветка фона при наведении, иконка на цветном квадрате.
 * Используется на странице «Физические серверы» (ВМ на сервере) и на
 * «Платформе виртуализации» (ВМ на хостах внутри кластера и вне его).
 */
export function VmCountBadge({
  count,
  onClick,
  title,
}: {
  count: number;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // не давать родителю-карточке открыть свою модалку/кат
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      title={title ?? `Показать ВМ этого сервера (${count})`}
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all duration-200 whitespace-nowrap shrink-0"
    >
      <span className="w-5 h-5 rounded-md bg-indigo-500 flex items-center justify-center shrink-0 shadow-sm">
        <Monitor className="w-3 h-3 text-white" />
      </span>
      ВМ: {count}
    </button>
  );
}

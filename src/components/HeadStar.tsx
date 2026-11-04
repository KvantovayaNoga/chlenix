import { Star } from 'lucide-react';

/**
 * Золотая звёздочка руководителя организации.
 * Ставится рядом с ФИО везде, где фигурирует пользователь/сотрудник:
 *  - карточка сотрудника, выбранного руководителем организации;
 *  - учётная запись, привязанная к такому сотруднику (наследует звезду).
 */
export function HeadStar({ className = '', title = 'Руководитель организации' }: { className?: string; title?: string }) {
  return (
    <span className="inline-flex items-center" title={title}>
      <Star
        className={`w-4 h-4 fill-amber-400 text-amber-500 dark:fill-amber-300 dark:text-amber-300 flex-shrink-0 ${className}`}
        aria-label={title}
      />
    </span>
  );
}

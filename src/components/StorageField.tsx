// ============================================================
// Поле объёма хранения (косяки 9, 10)
// - значение хранится в БД в ГБ; пользователь выбирает единицу КБ/МБ/ГБ/ТБ/ПБ;
// - допускается ввод дробных значений ТОЛЬКО через запятую (12,5);
// - точка и прочие символы отбрасываются с понятным подсказочным текстом.
// ============================================================
import { useEffect, useState } from 'react';
import { storageUnitLabels, toGB, fromGB, autoUnit, formatDecimal, parseDecimalInput, sanitizeDecimalText } from '../utils/virtualization';
import type { StorageUnit } from '../utils/virtualization';

interface Props {
  label: string;
  /** Значение в ГБ (или null) */
  valueGB: number | null | undefined;
  onChange: (gb: number | null) => void;
  placeholder?: string;
  hint?: string;
}

export function StorageField({ label, valueGB, onChange, placeholder, hint }: Props) {
  const [unit, setUnit] = useState<StorageUnit>(() => (valueGB ? autoUnit(valueGB) : 'GB'));
  const [text, setText] = useState<string>(() => (valueGB != null ? formatDecimal(fromGB(valueGB, unit || 'GB')) : ''));
  const [warn, setWarn] = useState<string>('');

  // Внешнее изменение значения -> пересчёт отображения в текущей единице
  useEffect(() => {
    if (valueGB == null) {
      setText('');
      return;
    }
    const u: StorageUnit = unit || autoUnit(valueGB);
    setText(formatDecimal(round6(fromGB(valueGB, u))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueGB]);

  const handleTextChange = (raw: string) => {
    // Косяк 10: только цифры и одна запятая; точка запрещена
    const [cleaned, dropped] = sanitizeDecimalText(raw);
    if (dropped) {
      setWarn('Допускается ввод только цифр и запятой (например, 12,5). Точка как разделитель не используется.');
    } else {
      setWarn('');
    }
    setText(cleaned);
    const num = parseDecimalInput(cleaned);
    if (num == null) onChange(null);
    else onChange(toGB(num, unit));
  };

  const handleUnitChange = (next: StorageUnit) => {
    setUnit(next);
    const num = parseDecimalInput(text);
    if (num != null && next !== unit) {
      // сохраняем физический объём: пересчитываем число под новую единицу
      const gb = toGB(num, unit);
      const newText = formatDecimal(round6(fromGB(gb, next)));
      setText(newText);
      onChange(gb);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono"
          placeholder={placeholder || 'Например: 480 или 12,5'}
          title="Дробные значения — только через запятую"
        />
        <select
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value as StorageUnit)}
          className="px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          aria-label="Единица измерения объёма"
        >
          {(Object.keys(storageUnitLabels) as StorageUnit[]).map((u) => (
            <option key={u} value={u}>{storageUnitLabels[u]}</option>
          ))}
        </select>
      </div>
      {warn ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{warn}</p>
      ) : hint ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</p>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Дробные значения — только через запятую.</p>
      )}
    </div>
  );
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

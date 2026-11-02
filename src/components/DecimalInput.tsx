// ============================================================
// Числовое поле с десятичным вводом (косяк 10)
// - принимает только цифры и ОДНУ запятую (50,12);
// - точка и прочие символы не печатаются; при попытке ввода точки —
//   всплывающая подсказка «Разделитель — запятая»;
// - значение хранится как number (null, если пусто).
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { sanitizeDecimalText, parseDecimalInput, formatDecimal } from '../utils/virtualization';

interface Props {
  label?: string;
  /** Текущее числовое значение (или null) */
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  className?: string;
}

export function DecimalInput({ label, value, onChange, placeholder, min, className }: Props) {
  const [text, setText] = useState<string>(() => (value != null ? formatDecimal(value) : ''));
  const [warn, setWarn] = useState('');
  const lastEmitted = useRef<number | null>(value ?? null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Внешнее изменение (например, сброс формы) -> обновляем отображение
  useEffect(() => {
    if ((value ?? null) !== lastEmitted.current) {
      setText(value != null ? formatDecimal(value) : '');
      lastEmitted.current = value ?? null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => () => { if (warnTimer.current) clearTimeout(warnTimer.current); }, []);

  const showWarn = (msg: string) => {
    setWarn(msg);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setWarn(''), 3000);
  };

  const handleTextChange = (raw: string) => {
    let dropped = false;
    let cleaned = raw;
    if (/[.]/.test(raw)) {
      // Явная попытка поставить точку — самая понятная подсказка
      showWarn('Разделитель — запятая. Например: 50,12');
      [cleaned] = sanitizeDecimalText(raw);
      dropped = true;
    } else {
      const [c, d] = sanitizeDecimalText(raw);
      cleaned = c;
      dropped = d;
      if (dropped) showWarn('Допускается ввод только цифр и запятой');
    }
    setText(cleaned);
    const num = parseDecimalInput(cleaned);
    if (num != null && min != null && num < min) {
      lastEmitted.current = null;
      onChange(null);
      return;
    }
    lastEmitted.current = num;
    onChange(num);
  };

  return (
    <div className="relative">
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyPress={(e) => {
          // Не пропускаем печать точек и прочего мусора (кроме backspace и т.п.)
          if (e.key === '.') { e.preventDefault(); showWarn('Разделитель — запятая. Например: 50,12'); }
        }}
        className={`w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 ${className || ''}`}
        placeholder={placeholder || 'Например: 128 или 4,5'}
        title="Дробные значения — только через запятую"
      />
      {/* Всплывающая подсказка (косяк 10) */}
      {warn && (
        <div className="absolute left-0 -top-2 translate-y-[-100%] z-10 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs shadow-lg whitespace-nowrap">
          {warn}
        </div>
      )}
    </div>
  );
}

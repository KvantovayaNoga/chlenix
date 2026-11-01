import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

/**
 * AvatarCropper — кадрирование аватара «как в best practice» (Google/Telegram/Instagram):
 *  - изображение всегда заполняет квадратную рамку (cover), пустых полей нет;
 *  - выделенная область = видимая часть изображения внутри рамки; что видно — то и сохранится;
 *  - перетаскивание мышью/пальцем (drag) для сдвига кадра;
 *  - колесо мыши / слайдер / кнопки — масштаб;
 *  - кнопка «Сбросить» возвращает исходное кадрирование;
 *  - превью результата справа показывает ТОЧНО тот кадр, который будет применён;
 *  - закрытие только крестиком/Отменой/Esc (клика по подложке нет).
 *
 * Реализация: transform: translate(-tx,-ty) scale(zoom) на <img>, origin center.
 * Экспорт: canvas 256×256, математика обратного преобразования координат центра рамки
 * -> пиксели исходного изображения (см. cropToCanvas).
 */

interface AvatarCropperProps {
  /** dataURL или URL исходного изображения */
  imageSrc: string;
  /** вызывается с dataURL готового квадрата 256×256 */
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
  /** размер стороны области кадрирования в CSS-пикселях (по умолчанию 320) */
  frameSize?: number;
  title?: string;
}

const OUTPUT_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function AvatarCropper({ imageSrc, onCrop, onCancel, frameSize = 320, title = 'Кадрирование аватара' }: AvatarCropperProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // zoom >= 1 (1 = cover), tx/ty — смещение центра картинки относительно центра рамки в CSS px
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [previewKey, setPreviewKey] = useState(0); // форсирует перерисовку превью

  // Загрузка размеров исходного изображения
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setPos({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Базовый масштаб "cover": картинка ровно заполняет квадрат при zoom=1
  const baseScale = natural ? Math.max(frameSize / natural.w, frameSize / natural.h) : 1;
  // Максимальный сдвиг, чтобы кадр всегда был целиком внутри изображения.
  // При zoom=1 картинка в точности заполняет кадр => offset 0.
  const renderW = natural ? natural.w * baseScale * zoom : 0;
  const renderH = natural ? natural.h * baseScale * zoom : 0;
  const maxOffsetX = Math.max(0, (renderW - frameSize) / 2);
  const maxOffsetY = Math.max(0, (renderH - frameSize) / 2);

  const clampPos = useCallback((x: number, y: number) => ({
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y)),
  }), [maxOffsetX, maxOffsetY]);

  // Колесо мыши — зум вокруг курсора (упрощённо: просто зум + клампинг позиции)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
  };

  // Drag (mouse + touch через pointer events)
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos(clampPos(dragState.current.origX + dx, dragState.current.origY + dy));
  };
  const onPointerUp = () => {
    dragState.current = null;
    setPreviewKey((k) => k + 1);
  };

  useEffect(() => {
    // Esc — отмена (закрытие крестиком тоже есть в UI)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // CSS-смещение левого верхнего края рендеренной картинки (до scale) относительно рамки.
  const tx = natural ? pos.x + (frameSize - natural.w * baseScale) / 2 : 0;
  const ty = natural ? pos.y + (frameSize - natural.h * baseScale) / 2 : 0;

  // Обратное преобразование: какие пиксели ИСХОДНИКА попадают в квадрат рамки.
  // transform-origin: left top => экранный сдвиг = T*zoom, масштаб = baseScale*zoom.
  const getSourceRect = () => {
    if (!natural) return null;
    const s = baseScale * zoom;            // CSS px на 1 px исходника
    const x0 = (-tx * zoom) / s;           // левый край кадра в px исходника
    const y0 = (-ty * zoom) / s;
    const side = frameSize / s;            // сторона квадрата в px исходника
    // КЛАМПИНГ РАЗМЕРОМ КАДРА (side), а не стороной: при clampPos(±maxOffset)
    // кадр гарантированно внутри изображения, поэтому x0/y0 уже корректны.
    // Прежний клампинг позицией ломал соответствие «видимое == сохранённое»
    // для изображений, чья cover-сторона больше стороны исходника.
    const sx = Math.max(0, Math.min(natural.w - side, x0));
    const sy = Math.max(0, Math.min(natural.h - side, y0));
    const sw = Math.min(side, natural.w);
    const sh = Math.min(side, natural.h);
    return { sx, sy, sw, sh };
  };

  const applyCrop = () => {
    const rect = getSourceRect();
    if (!rect || !natural) return;
    const img = imgRef.current ?? new Image();
    const doDraw = (source: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Белый фон под JPEG (защита от чёрного фона у PNG с альфой)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      onCrop(canvas.toDataURL('image/jpeg', 0.92));
    };
    if (imgRef.current && imgRef.current.complete) {
      doDraw(imgRef.current);
    } else {
      const pre = new Image();
      pre.onload = () => doDraw(pre);
      pre.src = imageSrc;
    }
  };

  // Превью «что вижу, то получу»: мини-копия текущего кадра (обновляется после drag/zoom)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const rect = getSourceRect();
      const img = imgRef.current;
      if (!rect || !img || !img.complete) return;
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, 96, 96);
      try { setPreviewSrc(canvas.toDataURL('image/png')); } catch { /* noop */ }
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y, zoom, natural]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      {/* закрытие по клику на подложку НАМЕРЕННО отсутствует (требование UX) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-3xl w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start justify-center">
          {/* Область кадрирования: картинка заполняет квадрат, двигается и масштабируется */}
          <div
            className="relative overflow-hidden rounded-lg bg-gray-900/5 dark:bg-gray-900/40 select-none touch-none cursor-grab active:cursor-grabbing shrink-0"
            style={{ width: frameSize, height: frameSize }}
            onWheel={handleWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {natural && (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop"
                draggable={false}
                className="absolute left-0 top-0 max-w-none will-change-transform"
                style={{
                  width: natural.w * baseScale,
                  height: natural.h * baseScale,
                  // translate применяется ДО scale (origin left top) => фактический сдвиг = T*zoom
                  transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
                  transformOrigin: 'left top',
                }}
              />
            )}
            {/* затемнение вне круга — аватар круглый, но сохраняется квадрат */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: 'inset 0 0 0 2000px rgba(0,0,0,0.35)', borderRadius: '50%' }}
            />
            <div className="absolute inset-0 rounded-lg border-2 border-white/60 pointer-events-none" />
          </div>

          {/* Правая колонка: управление + превью результата */}
          <div className="flex-1 min-w-[220px] space-y-5">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Масштаб</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                  onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))}
                  aria-label="Уменьшить"
                ><ZoomOut className="w-4 h-4" /></button>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => {
                    const nz = Number(e.target.value);
                    setZoom(nz);
                    setPos((p) => clampPos(p.x, p.y));
                  }}
                  className="flex-1 accent-indigo-600"
                />
                <button
                  type="button"
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                  onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
                  aria-label="Увеличить"
                ><ZoomIn className="w-4 h-4" /></button>
                <button
                  type="button"
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                  onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }}
                  aria-label="Сбросить кадрирование"
                  title="Сбросить"
                ><RotateCcw className="w-4 h-4" /></button>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Превью результата</p>
              <div className="flex items-center gap-3">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 shrink-0">
                  {previewSrc ? (
                    <img key={previewKey} src={previewSrc} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Перетаскивайте изображение, крутите колесо мыши или используйте слайдер.
                  В аватар попадёт ровно то, что видно в квадрате.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={applyCrop}
                disabled={!natural}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" /> Применить
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" /> Отмена
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

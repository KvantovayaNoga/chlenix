import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

/**
 * AvatarCropper — кадрирование аватара по принципу «что видно в круге — то и в аватаре».
 *
 * Ключевое отличие от прежней реализации: рамка-«иллюминатор» (прямая трансляция) УБРАНА.
 * Раньше пользователь выбирал область на всей картинке, а в аватар попадал совсем другой
 * фрагмент — превью не совпадало с выбором. Теперь:
 *  - изображение целиком показано внутри квадратной области (contain — видно ВСЮ картинку);
 *  - поверх лежит круглая маска: затемнено всё ВНЕ круга, внутри — чистое яркое окно;
 *  - перетаскивание = панорамирование картинки под окном, колесо/слайдер = зум вокруг курсора;
 *  - ЭКСПОРТ РЕНДЕРИТСЯ ОДНИМ И ТЕМ ЖЕ КОДОМ, что рисует экран: canvas-копия точь-в-точь
 *    той же CSS-трансформации (translate+scale), что у живого <img>, плюс та же круглая
 *    clip-маска. Никакой обратной математики координат рамки — расхождение выбора и
 *    результата стало невозможно по построению;
 *  - EXIF-ориентация фото учитывается через createImageBitmap({imageOrientation:'from-image'}),
 *    иначе снимки с телефона «переворачивались» между выбором и сохранением.
 */

interface AvatarCropperProps {
  /** dataURL или URL исходного изображения */
  imageSrc: string;
  /** вызывается с dataURL готового результата (квадрат OUTPUT_SIZE с вписанным кругом) */
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
  /** размер стороны области кадрирования в CSS-пикселях (по умолчанию 320) */
  frameSize?: number;
  title?: string;
}

const OUTPUT_SIZE = 512; // квадрат, в который вписан круг-аватар
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export function AvatarCropper({ imageSrc, onCrop, onCancel, frameSize = 320, title = 'Кадрирование аватара' }: AvatarCropperProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // zoom >= 1 (1 = contain), pos.x/y — смещение ЦЕНТРА картинки относительно центра области
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Загрузка размеров + применение EXIF-ориентации (фото с телефона без этого кривятся)
  useEffect(() => {
    let cancelled = false;
    const reset = () => { setZoom(1); setPos({ x: 0, y: 0 }); };
    (async () => {
      try {
        const blob = await fetch(imageSrc).then((r) => r.blob());
        const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
        if (!cancelled) { setNatural({ w: bmp.width, h: bmp.height }); reset(); bmp.close?.(); }
      } catch {
        const img = new Image();
        img.onload = () => { if (!cancelled) { setNatural({ w: img.naturalWidth, h: img.naturalHeight }); reset(); } };
        img.src = imageSrc;
      }
    })();
    return () => { cancelled = true; };
  }, [imageSrc]);

  // Базовый масштаб "contain": при zoom=1 видна ВСЯ картинка целиком
  const baseScale = natural ? Math.min(frameSize / natural.w, frameSize / natural.h) : 1;
  const renderW = natural ? natural.w * baseScale * zoom : 0;
  const renderH = natural ? natural.h * baseScale * zoom : 0;
  // Сдвиг ограничиваем так, чтобы круглое окно всегда было внутри картинки
  const maxOffsetX = Math.max(0, (renderW - frameSize) / 2);
  const maxOffsetY = Math.max(0, (renderH - frameSize) / 2);

  const clampPos = useCallback((x: number, y: number) => ({
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y)),
  }), [maxOffsetX, maxOffsetY]);

  // Смещение левого верхнего угла рендеренной картинки относительно области (CSS px)
  const tx = natural ? pos.x + (frameSize - natural.w * baseScale) / 2 : 0;
  const ty = natural ? pos.y + (frameSize - natural.h * baseScale) / 2 : 0;

  // Зум вокруг точки (курсор/центр): точка изображения под курсором остаётся на месте
  const applyZoom = (nextZoomRaw: number, centerClientX?: number, centerClientY?: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoomRaw));
    if (!natural || !stageRef.current) { setZoom(nz); setPos(clampPos(pos.x, pos.y)); return; }
    const rect = stageRef.current.getBoundingClientRect();
    const cx = centerClientX != null ? centerClientX - rect.left : rect.width / 2;
    const cy = centerClientY != null ? centerClientY - rect.top : rect.height / 2;
    const px = (cx - tx) / (baseScale * zoom); // пиксель исходника под центром зума
    const py = (cy - ty) / (baseScale * zoom);
    const sn = baseScale * nz;
    const txNew = cx - px * sn;
    const tyNew = cy - py * sn;
    setZoom(nz);
    setPos(clampPos(txNew - (frameSize - natural.w * baseScale) / 2, tyNew - (frameSize - natural.h * baseScale) / 2));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    applyZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
  };

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
  const onPointerUp = () => { dragState.current = null; };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // ЭКСПОРТ: canvas-копия ровно того же рендера, что на экране.
  // Источник drawImage — живой <img> (он уже содержит EXIF-коррекцию браузера);
  // трансформация повторяет CSS <img> (те же tx/ty/baseScale/zoom), кроп — тот же круг.
  const captureAndApply = () => {
    const source = imgRef.current;
    if (!source || !natural || !source.complete) return;
    const k = OUTPUT_SIZE / frameSize; // CSS px -> px результата
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(baseScale * zoom * k, 0, 0, baseScale * zoom * k, tx * k, ty * k);
    ctx.drawImage(source, 0, 0, natural.w, natural.h);
    ctx.restore();
    onCrop(canvas.toDataURL('image/jpeg', 0.92));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
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
          {/* Область кадрирования: вся картинка + круглое «окно» аватара поверх */}
          <div
            ref={stageRef}
            className="relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900 select-none touch-none cursor-grab active:cursor-grabbing shrink-0"
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
                  transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
                  transformOrigin: 'left top',
                }}
              />
            )}
            {/* Круглое окно аватара: всё вне круга затемнено — это и есть граница выбора */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: 'inset 0 0 0 2000px rgba(0,0,0,0.55)', borderRadius: '50%' }}
            />
            <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/80" />
          </div>

          {/* Правая колонка: управление + живое превью */}
          <div className="flex-1 min-w-[220px] space-y-5">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Масштаб</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                  onClick={() => applyZoom(zoom / 1.2)}
                  aria-label="Уменьшить"
                ><ZoomOut className="w-4 h-4" /></button>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => applyZoom(Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
                <button
                  type="button"
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                  onClick={() => applyZoom(zoom * 1.2)}
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
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Превью аватара</p>
              <div className="flex items-center gap-3">
                {/* Живое круглое превью: ТОЧКА-В-ТОЧЬ та же трансформация, что у большого окна */}
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 shrink-0 relative">
                  {natural && (
                    <img
                      src={imageSrc}
                      alt="Preview"
                      draggable={false}
                      className="absolute left-0 top-0 max-w-none"
                      style={{
                        width: natural.w * baseScale * (96 / frameSize),
                        height: natural.h * baseScale * (96 / frameSize),
                        transform: `translate(${tx * (96 / frameSize)}px, ${ty * (96 / frameSize)}px) scale(${zoom})`,
                        transformOrigin: 'left top',
                      }}
                    />
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Двигайте картинку, крутите колесо мыши. В аватар попадёт ровно то,
                  что внутри белого круга.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={captureAndApply}
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

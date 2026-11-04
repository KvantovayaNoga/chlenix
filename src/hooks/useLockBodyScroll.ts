import { useEffect } from "react";

/**
 * Блокировка прокрутки фона при открытом модальном окне.
 *
 * В проекте страница скроллится не только <body>, но и внутренний контейнер
 * <main class="overflow-auto"> (Layout), поэтому при активации любого модального
 * окна (контейнер с классом `modal-root`) фиксируем position у documentElement,
 * body и всех внутренних скроллящихся контейнеров. Прокрутка становится возможна
 * только внутри самого модального окна.
 *
 * Счётчик активных модалок нужен для вложенных окон (модалка поверх модалки):
 * разблокировка происходит, когда закрыта последняя из них.
 */
let activeCount = 0;
const savedStates: Array<{ el: HTMLElement; inline: string }> = [];

function collectScrollContainers(): HTMLElement[] {
  const els: HTMLElement[] = [document.documentElement, document.body];
  // внутренние области прокрутки приложения (main/Layout и т.п.)
  document
    .querySelectorAll<HTMLElement>("main, [data-scroll-container]")
    .forEach((el) => {
      if (!els.includes(el)) els.push(el);
    });
  return els;
}

export function lockBackgroundScroll() {
  if (typeof document === "undefined") return;
  activeCount += 1;
  if (activeCount > 1) return; // фон уже заблокирован предыдущей модалкой

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  savedStates.length = 0;
  // ВАЖНО: position:fixed для <main> НЕ применяется. Layout строится как
  // flex-контейнер (<div class="flex"> сайдбар + main), и фиксация <main>
  // вырывала его из потока: при открытии модалки сайдбар визуально «исчезал»,
  // а контент уезжал под него (страница «ломалась»). Вместо этого — простая
  // блокировка прокрутки через overflow:hidden: высота <main> ограничена
  // вьюпортом (min-h-screen + h-screen у сайдбара), поэтому скролл внутри
  // него останавливается сразу, без перестройки макета. Позиция прокрутки
  // сохраняется (scrollTop не сбрасывается при overflow:hidden).
  for (const el of collectScrollContainers()) {
    savedStates.push({ el, inline: el.style.cssText });
    if (el === document.documentElement || el === document.body) {
      el.style.setProperty("position", "fixed", "important");
      // сохраняем текущую позицию прокрутки, чтобы фон не «прыгал» наверх
      el.style.setProperty("top", `-${el.scrollTop}px`, "important");
      el.style.setProperty("left", "0", "important");
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("height", "100%", "important");
      el.style.setProperty("overscroll-behavior", "none", "important");
    } else {
      // внутренние контейнеры (main/Layout): только блокируем прокрутку
      el.style.setProperty("overflow", "hidden", "important");
      el.style.setProperty("overscroll-behavior", "contain", "important");
    }
  }
  // компенсация исчезнувшей полосы прокрутки (чтобы не было «прыжка» вёрстки)
  document.body.style.setProperty(
    "padding-right",
    `${Math.max(scrollbarWidth, 0)}px`,
    "important"
  );
}

export function unlockBackgroundScroll() {
  if (typeof document === "undefined") return;
  if (activeCount === 0) return;
  activeCount -= 1;
  if (activeCount > 0) return; // ещё есть открытые модалки

  for (const { el, inline } of savedStates) {
    const restoreTop = el.style.top;
    el.style.cssText = inline;
    // возвращаем контейнер на ту же позицию прокрутки, что была до блокировки
    const offset = parseFloat(restoreTop) || 0;
    if (offset !== 0) el.scrollTop = -offset;
  }
  savedStates.length = 0;
}

/** Хук: вызывать с флагом открытости модалки. */
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockBackgroundScroll();
    return () => unlockBackgroundScroll();
  }, [active]);
}

/**
 * Автоблокировка для всех модалок проекта: отслеживаем появление/исчезновение
 * элементов `.modal-root` в DOM (MutationObserver). Работает без правки каждой
 * отдельной модалки — достаточно добавить класс `modal-root` к корневому
 * контейнеру окна.
 */
export function startModalScrollGuard(): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined")
    return () => {};

  let locked = false;
  const sync = () => {
    const anyOpen = !!document.querySelector(".modal-root");
    if (anyOpen && !locked) {
      locked = true;
      lockBackgroundScroll();
    } else if (!anyOpen && locked) {
      locked = false;
      unlockBackgroundScroll();
    }
  };

  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });
  sync();

  return () => {
    observer.disconnect();
    if (locked) {
      locked = false;
      unlockBackgroundScroll();
    }
  };
}

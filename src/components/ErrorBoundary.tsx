// ============================================================
// Глобальная страховка от падения рендера: если любая ошибка
// всё-таки произойдёт, пользователь увидит сообщение с кнопкой
// перезагрузки вместо пустого фона.
// ============================================================
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // пишем в консоль для диагностики
    console.error('Chlenix render error:', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 text-center space-y-4">
            <h1 className="text-lg font-semibold text-red-600 dark:text-red-400">
              Что-то пошло не так
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 break-words">
              {String(this.state.error.message || this.state.error)}
            </p>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

export function Layout() {
  return (
    <div className="flex bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <main className="flex-1 min-h-screen overflow-auto">
        {/* Верхняя панель с переключателем темы */}
        <div className="sticky top-0 z-40 flex items-center justify-end px-8 pt-4 pb-2 bg-gradient-to-b from-gray-50 to-transparent dark:from-gray-900 dark:to-transparent pointer-events-none">
          <div className="pointer-events-auto">
            <ThemeToggle />
          </div>
        </div>
        <div className="p-8 -mt-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

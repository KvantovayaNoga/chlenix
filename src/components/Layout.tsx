import { Outlet } from '../router';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <main className="flex-1 min-h-screen overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

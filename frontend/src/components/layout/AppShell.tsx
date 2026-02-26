import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSocket } from '../../hooks/useSocket';

export function AppShell() {
  // Initialize socket connection
  useSocket();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <TopBar />
      {/* Main content — offset by sidebar width and topbar height */}
      <main className="ml-16 pt-16 min-h-screen transition-all duration-300">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

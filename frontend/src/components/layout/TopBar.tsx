import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Sun,
  Moon,
  LogOut,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useAuthStore } from '../../store/authStore';
import { useLogout } from '../../hooks/useAuth';
import { useNotificationStore } from '../../store/notificationStore';
import { cn, getInitials } from '../../lib/utils';


export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuthStore();
  const logout = useLogout();
  const { unreadCount } = useNotificationStore();
  const navigate = useNavigate();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="fixed top-0 right-0 left-16 h-16 bg-background/80 backdrop-blur-sm border-b border-border z-30 flex items-center px-6 gap-4 transition-all duration-300">
      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notification bell */}
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className={cn(
              'flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg transition-colors',
              'hover:bg-accent text-sm',
              userMenuOpen && 'bg-accent'
            )}
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold flex-shrink-0">
              {user ? getInitials(user.name.split(' ')[0], user.name.split(' ')[1] || '') : 'U'}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-none">
              <span className="font-medium text-foreground text-xs">{user?.name || 'User'}</span>
              <span className="text-muted-foreground text-[10px] capitalize">{user?.role?.toLowerCase() || 'admin'}</span>
            </div>
            <ChevronDown className={cn('w-3 h-3 text-muted-foreground transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-card shadow-lg py-1.5 z-50">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-xs font-semibold text-foreground">{user?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { navigate('/settings'); setUserMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                Settings
              </button>
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={() => { logout(); setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

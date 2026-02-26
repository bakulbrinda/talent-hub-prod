import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Users,
  BarChart3,
  Scale,
  Sparkles,
  Gift,
  TrendingUp,
  Award,
  Zap,
  FlaskConical,
  Bell,
  Settings,
} from 'lucide-react';

function IMochaIcon({ size = 28 }: { size?: number }) {
  // 3-segment ring icon matching the iMocha brand mark
  // r=9.5, circumference≈59.7, segment=15, gap=5  (3×(15+5)=60≈59.7 ✓)
  // rotate(-130) places the first gap at ~1:30-2:30 o'clock (top-right)
  const r = 9.5;
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle
        cx="14" cy="14" r={r}
        stroke="#F56521" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray="15 5 15 5 15 5"
        transform="rotate(-130 14 14)"
      />
      {/* Dot at gap centre (~60° from 12 o'clock = top-right) */}
      <circle cx="22" cy="9" r="2.5" fill="#F56521" />
    </svg>
  );
}
import { cn } from '../../lib/utils';
import { useNotificationStore } from '../../store/notificationStore';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/job-architecture', label: 'Job Architecture', icon: Layers },
  { path: '/employees', label: 'Employees', icon: Users },
  { path: '/salary-bands', label: 'Salary Bands', icon: BarChart3 },
  { path: '/pay-equity', label: 'Pay Equity', icon: Scale },
  { path: '/ai-insights', label: 'AI Insights', icon: Sparkles },
  { path: '/benefits', label: 'Benefits', icon: Gift },
  { path: '/rsu', label: 'RSU Tracker', icon: Award },
  { path: '/performance', label: 'Performance', icon: TrendingUp },
  { path: '/variable-pay', label: 'Variable Pay', icon: Zap },
  { path: '/scenarios', label: 'Scenario Modeler', icon: FlaskConical },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { unreadCount } = useNotificationStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col z-40 group',
        'bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]',
        'w-16 hover:w-60 transition-all duration-300 overflow-hidden'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[hsl(var(--sidebar-border))] overflow-hidden flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <IMochaIcon size={26} />
          <span className="font-bold text-[hsl(var(--sidebar-foreground))] text-sm tracking-tight whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            CompSense
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/dashboard'
                ? location.pathname === '/dashboard'
                : location.pathname.startsWith(item.path);
            const badge =
              item.path === '/notifications' ? unreadCount : undefined;

            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  title={item.label}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-all duration-150',
                    isActive
                      ? 'bg-[hsl(var(--sidebar-accent)/0.15)] text-[hsl(var(--sidebar-accent))] font-medium'
                      : 'text-[hsl(var(--sidebar-foreground)/0.65)] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-white/5'
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <Icon
                      className={cn('w-4 h-4', isActive && 'text-[hsl(var(--sidebar-accent))]')}
                    />
                    {badge !== undefined && badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                  <span className="truncate flex-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {item.label}
                  </span>
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* iMocha branding footer */}
      <div className="px-4 py-3 border-t border-[hsl(var(--sidebar-border))] flex items-center gap-2 flex-shrink-0 overflow-hidden">
        <IMochaIcon size={20} />
        <span className="text-[10px] text-[hsl(var(--sidebar-foreground)/0.35)] font-medium tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          Powered by iMocha
        </span>
      </div>
    </aside>
  );
}

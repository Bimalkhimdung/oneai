'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import {
  LayoutDashboard,
  Server,
  Boxes,
  MessageSquare,
  GitCompare,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/servers', label: 'AI Servers', icon: Server },
  { href: '/models', label: 'Models', icon: Boxes },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/compare', label: 'Compare', icon: GitCompare },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/10 md:flex md:flex-col justify-between">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex h-14 items-center border-b px-5 font-semibold">Local AI Hub</div>
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href as any}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {user && (
        <div className="border-t border-border/40 p-3 bg-card/20">
          <Link
            href="/profile"
            className={cn(
              "flex items-center gap-3 rounded-md p-2 text-sm transition-all hover:bg-accent hover:text-accent-foreground",
              pathname === "/profile" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold border border-primary/20">
              {user.fullName ? user.fullName.split(" ").map((n) => n[0]).join("").toUpperCase() : "U"}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="truncate text-xs font-semibold text-foreground leading-none mb-1">{user.fullName}</span>
              <span className="truncate text-[10px] text-muted-foreground leading-none">{user.email}</span>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}

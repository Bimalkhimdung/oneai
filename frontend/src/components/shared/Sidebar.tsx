'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import {
  LayoutDashboard,
  Server,
  Boxes,
  MessageSquare,
  GitCompare,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/servers', label: 'AI Servers', icon: Server },
  { href: '/models', label: 'Models', icon: Boxes },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    subItems: [
      { href: '/settings', label: 'Model Provider' },
      { href: '/settings/mcp', label: 'MCP Servers' },
      { href: '/settings/api', label: 'Api Configuration' }
    ]
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Auto-expand sections based on current path
    if (pathname?.startsWith('/settings')) {
      setExpanded(prev => ({ ...prev, '/settings': true }));
    }
  }, [pathname]);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/10 md:flex md:flex-col justify-between">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span
            className="text-[15px] font-bold tracking-tight select-none"
            style={{ fontFamily: 'var(--font-brand, sans-serif)', letterSpacing: '-0.02em' }}
          >
            <span className="text-foreground">Local</span><span className="text-primary">AI</span>
          </span>
          <Image src="/logo/hero/local1.svg" alt="Local AI Logo" width={20} height={100} className="h-[160%] w-auto max-h-50" priority />
        </div>
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const hasSubItems = 'subItems' in item && item.subItems.length > 0;
            const active = pathname === item.href || ('subItems' in item && item.subItems.some(sub => pathname === sub.href || pathname?.startsWith(sub.href + '/')));

            return (
              <div key={item.href} className="flex flex-col">
                {hasSubItems ? (
                  <button
                    onClick={() => setExpanded(prev => ({ ...prev, [item.href]: !prev[item.href] }))}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors w-full group',
                      active && !expanded[item.href]
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </div>
                    {expanded[item.href] ? <ChevronDown className="h-4 w-4 opacity-70 group-hover:opacity-100" /> : <ChevronRight className="h-4 w-4 opacity-70 group-hover:opacity-100" />}
                  </button>
                ) : (
                  <Link
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
                )}

                {hasSubItems && expanded[item.href] && (
                  <div className="mt-1 flex flex-col space-y-0.5 relative">
                    <div className="absolute left-[1.375rem] top-0 bottom-1 w-px bg-border/60" />
                    {item.subItems.map((sub) => {
                      const subActive = pathname === sub.href || (sub.href !== '/settings' && pathname?.startsWith(sub.href + '/')) || (sub.href === '/settings' && pathname === '/settings/ollama/models');
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href as any}
                          className={cn(
                            'flex items-center relative pl-10 pr-3 py-1.5 text-sm transition-colors rounded-md',
                            subActive
                              ? 'text-foreground font-medium bg-accent/50'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
                          )}
                        >
                          <span className={cn(
                            "absolute left-[1.375rem] top-1/2 -translate-y-1/2 w-[2px] h-4 -translate-x-1/2 rounded-full transition-colors",
                            subActive ? "bg-primary" : "bg-transparent"
                          )} />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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

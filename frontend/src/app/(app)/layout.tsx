'use client';

import { Sidebar } from '@/components/shared/Sidebar';
import { useRequireAuth } from '@/hooks/useAuth';
import { SystemSpecsNav } from '@/components/shared/SystemSpecsNav';
import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useRequireAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-bokeh bg-grid-dark bg-beams text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col relative z-10">
        <header className="flex h-14 items-center justify-between border-b border-border/40 bg-card/30 backdrop-blur-md px-6">
          <div className="text-sm text-muted-foreground">Welcome back, {user.fullName}</div>
          <SystemSpecsNav />
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        <footer className="w-full border-t border-border/40 bg-card/30 px-6 py-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Local AI Hub. Built for private local AI workflows.</p>
            <nav className="flex items-center gap-5">
              <Link href={'/about' as any} className="transition-colors hover:text-foreground">About</Link>
              <Link href={'/contact' as any} className="transition-colors hover:text-foreground">Contact</Link>
              <Link href={'/terms' as any} className="transition-colors hover:text-foreground">Terms</Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

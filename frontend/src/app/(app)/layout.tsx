'use client';

import { Sidebar } from '@/components/shared/Sidebar';
import { useRequireAuth } from '@/hooks/useAuth';
import { SystemSpecsNav } from '@/components/shared/SystemSpecsNav';

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
      </div>
    </div>
  );
}

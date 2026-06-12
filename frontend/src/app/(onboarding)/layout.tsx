'use client';

import { useRequireAuth } from '@/hooks/useAuth';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAuth({ onboardingRoute: true });

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bokeh bg-grid-dark bg-beams overflow-hidden">
      {children}
    </div>
  );
}

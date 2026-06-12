'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { api, ApiClientError } from '@/lib/api';
import type { AuthResultDto } from '@/types/shared';

interface UseRequireAuthOptions {
  /** Set true on the onboarding page so we don't redirect away on fresh sessions */
  onboardingRoute?: boolean;
}

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { onboardingRoute = false } = options;
  const router = useRouter();
  const { user, hydrated, setSession, setHydrated, clear } = useAuthStore();

  useEffect(() => {
    if (hydrated) {
      if (!user) {
        router.replace('/login');
      } else if (!onboardingRoute) {
        const seen = typeof window !== 'undefined'
          ? localStorage.getItem(`onboarding_done_${user.id}`)
          : null;
        if (!seen) {
          router.replace('/onboarding');
        }
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api<AuthResultDto>('/auth/refresh', { method: 'POST', auth: false });
        if (cancelled) return;
        setSession(res.user, res.accessToken);
        // Fresh session – if not on the onboarding route, check if we need to redirect there
        if (!onboardingRoute) {
          const seen = typeof window !== 'undefined'
            ? localStorage.getItem(`onboarding_done_${res.user.id}`)
            : null;
          if (!seen) {
            router.replace('/onboarding');
          }
        }
      } catch (err) {
        if (cancelled) return;
        clear();
        router.replace('/login');
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user, setSession, setHydrated, clear, router, onboardingRoute]);

  return { user, ready: hydrated };
}

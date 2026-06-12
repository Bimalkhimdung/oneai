'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { api, ApiClientError } from '@/lib/api';
import type { AuthResultDto } from '@/types/shared';

export function useRequireAuth() {
  const router = useRouter();
  const { user, hydrated, setSession, setHydrated, clear } = useAuthStore();

  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<AuthResultDto>('/auth/refresh', { method: 'POST', auth: false });
        if (cancelled) return;
        setSession(res.user, res.accessToken);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 401) {
          clear();
          router.replace('/login');
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, setSession, setHydrated, clear, router]);

  return { user, ready: hydrated };
}

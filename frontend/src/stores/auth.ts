'use client';

import { create } from 'zustand';
import type { UserDto } from '@/types/shared';
import { setAccessToken } from '@/lib/api';

interface AuthState {
  user: UserDto | null;
  accessToken: string | null;
  hydrated: boolean;
  setSession: (user: UserDto, accessToken: string) => void;
  clear: () => void;
  setHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  hydrated: false,
  setSession: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, accessToken });
  },
  clear: () => {
    setAccessToken(null);
    set({ user: null, accessToken: null });
  },
  setHydrated: (v) => set({ hydrated: v }),
}));

'use client';

import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';

export function useSocket() {
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    return () => {
      // Keep the socket alive across pages; only disconnect on logout.
      void socket;
    };
  }, [token]);

  useEffect(() => {
    return () => {
      if (!useAuthStore.getState().accessToken) disconnectSocket();
    };
  }, []);
}

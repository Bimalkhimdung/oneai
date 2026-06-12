'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateServerInput, ServerDto } from '@/types/shared';

const KEY = ['servers'] as const;

export function useServers() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<ServerDto[]>('/servers'),
  });
}

export function useCreateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServerInput) =>
      api<ServerDto>('/servers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/servers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestServer() {
  return useMutation({
    mutationFn: (input: { host: string; port: number; provider: string; apiKey?: string }) =>
      api<{ ok: boolean; version: string | null; error?: string; latencyMs: number }>(
        '/servers/test',
        { method: 'POST', body: JSON.stringify(input) },
      ),
  });
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CreateMcpServerInput,
  McpServerDto,
  McpTestResultDto,
  UpdateMcpServerInput,
} from '@/types/shared';

const LIST_KEY = ['mcp-servers'] as const;

export function useMcpServers() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api<McpServerDto[]>('/mcp-servers'),
  });
}

export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMcpServerInput) =>
      api<McpServerDto>('/mcp-servers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMcpServerInput }) =>
      api<McpServerDto>(`/mcp-servers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useDeleteMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/mcp-servers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useTestMcpServer() {
  return useMutation({
    mutationFn: (id: string) =>
      api<McpTestResultDto>(`/mcp-servers/${id}/test`, { method: 'POST' }),
  });
}

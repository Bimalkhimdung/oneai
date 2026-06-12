'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ChatDetailDto,
  ChatDto,
  CreateChatInput,
  MessageDto,
} from '@/types/shared';

const LIST_KEY = ['chats'] as const;
const detailKey = (id: string) => ['chats', id] as const;

export function useChats() {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => api<ChatDto[]>('/chats') });
}

export function useChat(id: string | undefined) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['chats', 'none'],
    queryFn: () => api<ChatDetailDto>(`/chats/${id}`),
    enabled: !!id,
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChatInput) =>
      api<ChatDto>('/chats', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useSendMessage(chatId: string) {
  return useMutation({
    mutationFn: (content: string) =>
      api<{ userMessage: MessageDto; assistantMessage: MessageDto }>(
        `/chats/${chatId}/messages`,
        { method: 'POST', body: JSON.stringify({ content }) },
      ),
  });
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getAccessToken } from '@/lib/api';
import type {
  ChatAgentRunRequest,
  ChatAgentStreamEvent,
  ChatDetailDto,
  ChatDto,
  CreateChatInput,
  MessageDto,
} from '@/types/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
    mutationFn: (input: { content: string; web_search?: boolean; mcp_enabled?: boolean }) =>
      api<{ userMessage: MessageDto; assistantMessage: MessageDto }>(
        `/chats/${chatId}/messages`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
  });
}

export function useUploadDocument(chatId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api<{ message: string }>(`/chats/${chatId}/documents`, {
        method: 'POST',
        body: formData,
      });
    },
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/chats/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.removeQueries({ queryKey: detailKey(id) });
    },
  });
}

function parseChatAgentSseBlock(block: string): ChatAgentStreamEvent | null {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    const payload = JSON.parse(data);
    switch (event) {
      case 'user_message':
        return {
          type: 'user_message',
          messageId: payload.messageId,
          content: payload.content ?? '',
        };
      case 'assistant_message':
        return { type: 'assistant_message', messageId: payload.messageId };
      case 'thought':
        return { type: 'thought', content: payload.content ?? '' };
      case 'tool_call':
        return { type: 'tool_call', name: payload.name, arguments: payload.arguments ?? {} };
      case 'tool_result':
        return { type: 'tool_result', name: payload.name, result: payload.result ?? '' };
      case 'response':
        return { type: 'response', content: payload.content ?? '' };
      case 'error':
        return { type: 'error', content: payload.content ?? 'Unknown error' };
      case 'done':
        return {
          type: 'done',
          chatId: payload.chatId,
          userMessageId: payload.userMessageId,
          assistantMessageId: payload.assistantMessageId,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function runChatAgentStream(
  chatId: string,
  input: ChatAgentRunRequest,
  onEvent: (event: ChatAgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/chats/${chatId}/agent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? err?.error?.message ?? res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const evt = parseChatAgentSseBlock(part.trim());
      if (evt) onEvent(evt);
    }
  }

  if (buffer.trim()) {
    const evt = parseChatAgentSseBlock(buffer.trim());
    if (evt) onEvent(evt);
  }
}

'use client';

import { api, getAccessToken } from '@/lib/api';
import type {
  AgentRunRequest,
  AgentSettingsDto,
  AgentSessionDetailDto,
  AgentSessionDto,
  AgentStreamEvent,
  AgentTeamDto,
  CreateAgentTeamInput,
  ToolDefinition,
} from '@/types/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function fetchAgentTools(): Promise<ToolDefinition[]> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/tools`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load tools');
  return res.json();
}

export async function fetchAgentSettings(): Promise<AgentSettingsDto> {
  return api<AgentSettingsDto>('/agent/settings');
}

export async function saveAgentSettings(input: AgentSettingsDto): Promise<AgentSettingsDto> {
  return api<AgentSettingsDto>('/agent/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function fetchAgentSessions(): Promise<AgentSessionDto[]> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/sessions`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export async function fetchAgentSession(id: string): Promise<AgentSessionDetailDto> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/session/${id}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function deleteAgentSession(id: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/session/${id}`, {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete session');
}

function parseSseBlock(block: string): AgentStreamEvent | null {
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
      case 'thought':
        return { type: 'thought', content: payload.content ?? '' };
      case 'tool_call':
        return { type: 'tool_call', name: payload.name, arguments: payload.arguments ?? {} };
      case 'tool_result':
        return { type: 'tool_result', name: payload.name, result: payload.result ?? '' };
      case 'agent_message':
        return {
          type: 'agent_message',
          agent: payload.agent,
          content: payload.content ?? '',
          model: payload.model,
        };
      case 'handoff':
        return {
          type: 'handoff',
          from: payload.from ?? null,
          to: payload.to,
          reason: payload.reason,
        };
      case 'response':
        return { type: 'response', content: payload.content ?? '' };
      case 'error':
        return { type: 'error', content: payload.content ?? 'Unknown error' };
      case 'done':
        return { type: 'done', sessionId: payload.sessionId };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function runAgentStream(
  input: AgentRunRequest,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/run`, {
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
      const evt = parseSseBlock(part.trim());
      if (evt) onEvent(evt);
    }
  }

  if (buffer.trim()) {
    const evt = parseSseBlock(buffer.trim());
    if (evt) onEvent(evt);
  }
}

export async function fetchAgentTeams(): Promise<AgentTeamDto[]> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/teams`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load teams');
  return res.json();
}

export async function createAgentTeam(input: CreateAgentTeamInput): Promise<AgentTeamDto> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/teams`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create team');
  return res.json();
}

export async function deleteAgentTeam(id: string): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/api/v1/agent/teams/${id}`, {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete team');
}

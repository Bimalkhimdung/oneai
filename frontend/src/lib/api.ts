import type { ApiError } from '@/types/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiClientError extends Error {
  constructor(public status: number, public payload: ApiError['error']) {
    super(payload.message);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  if (init.auth !== false && accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError['error'] = body?.error ?? { code: 'unknown', message: res.statusText };
    throw new ApiClientError(res.status, err);
  }
  return body as T;
}

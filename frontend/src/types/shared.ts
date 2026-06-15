export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface AuthResultDto {
  user: UserDto;
  accessToken: string;
  expiresIn: number;
}

export interface ServerDto {
  id: string;
  name: string;
  host: string;
  port: number;
  provider: 'OLLAMA' | 'LM_STUDIO' | 'VLLM' | 'OPENAI_COMPAT' | 'LOCALAI';
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN' | 'ERROR';
  version: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  models: Array<{ id: string; name: string; [key: string]: unknown }>;
}

export interface ModelDto {
  id: string;
  serverId: string;
  name: string;
  family: string | null;
  sizeBytes: string;
  digest: string;
  installedAt: string;
  lastUsedAt: string | null;
}

export interface MessageDto {
  id: string;
  chatId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  modelName: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number | null;
  createdAt: string;
}

export interface DocumentDto {
  id: string;
  chatId: string;
  filename: string;
  createdAt: string;
}

export interface ChatDto {
  id: string;
  title: string;
  pinned: boolean;
  modelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatDetailDto extends ChatDto {
  messages: MessageDto[];
  documents: DocumentDto[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Zod schemas matching definitions
export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export type ProviderValue = 'OLLAMA' | 'LM_STUDIO' | 'VLLM' | 'OPENAI_COMPAT' | 'LOCALAI';

export interface CreateServerInput {
  name: string;
  host: string;
  port: number;
  provider: ProviderValue;
  apiKey?: string;
}

export interface TestServerInput {
  host: string;
  port: number;
  provider: ProviderValue;
  apiKey?: string;
}

export interface CreateChatInput {
  modelId: string;
  title?: string;
}

export interface SendMessageInput {
  content: string;
  web_search?: boolean;
  mcp_enabled?: boolean;
}

export interface UpdateChatInput {
  title?: string;
  pinned?: boolean;
}

export interface CompareInput {
  prompt: string;
  modelIds: string[];
}

export interface CompareResultDto {
  modelId: string;
  modelName: string;
  content: string;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number | null;
  error?: string | null;
}

export interface CompareResponseDto {
  prompt: string;
  results: CompareResultDto[];
}

export type McpTransport = 'STDIO' | 'SSE';

export interface McpServerDto {
  id: string;
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[] | null;
  env: Record<string, string> | null;
  url: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMcpServerInput {
  name: string;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled?: boolean;
}

export interface UpdateMcpServerInput {
  name?: string;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled?: boolean;
}

export interface McpTestResultDto {
  ok: boolean;
  toolCount: number;
  resourceCount: number;
  tools: string[];
  error?: string | null;
}

// Socket.IO events contract
export type ServerStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN' | 'ERROR';

export interface ServerOnlinePayload {
  serverId: string;
  version: string | null;
}

export interface ServerOfflinePayload {
  serverId: string;
  reason: string;
}

export interface InstallProgressPayload {
  installationId: string;
  serverId: string;
  modelName: string;
  status: 'QUEUED' | 'PULLING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  pulledBytes?: number;
  totalBytes?: number;
}

export interface InstallCompletedPayload {
  installationId: string;
  modelId: string;
}

export interface InstallFailedPayload {
  installationId: string;
  error: string;
}

export interface ChatStreamDeltaPayload {
  chatId: string;
  messageId: string;
  delta: string;
  done: boolean;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
}

export interface CompareStreamDeltaPayload {
  runId: string;
  modelId: string;
  delta: string;
  done: boolean;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
}

export interface HardwareUpdatePayload {
  ts: number;
  cpu: { load: number; cores: number };
  mem: { used: number; total: number };
  gpu?: { load: number; mem: number; memTotal: number; name: string }[];
  disk: { used: number; total: number };
  net: { rxSec: number; txSec: number };
}

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ServerToClientEvents {
  'server.online': (p: ServerOnlinePayload) => void;
  'server.offline': (p: ServerOfflinePayload) => void;
  'model.install.progress': (p: InstallProgressPayload) => void;
  'model.install.completed': (p: InstallCompletedPayload) => void;
  'model.install.failed': (p: InstallFailedPayload) => void;
  'chat.stream.delta': (p: ChatStreamDeltaPayload) => void;
  'compare.stream.delta': (p: CompareStreamDeltaPayload) => void;
  'hardware.update': (p: HardwareUpdatePayload) => void;
  notification: (p: NotificationPayload) => void;
}

export interface ClientToServerEvents {
  'chat.cancel': (p: { chatId: string; messageId: string }) => void;
  'hardware.subscribe': () => void;
  'hardware.unsubscribe': () => void;
}

export const SocketRooms = {
  user: (userId: string) => `user:${userId}`,
  server: (serverId: string) => `server:${serverId}`,
  hardware: (userId: string) => `hw:${userId}`,
} as const;

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatStreamDeltaPayload, MessageDto, DocumentDto } from '@/types/shared';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { extractTextFromPDF } from '@/lib/pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSendMessage, useUploadDocument, runChatAgentStream } from '@/queries/chats';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Loader2, FileText, X, Mic, ArrowUp, Globe, Plug, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
import { MissingModelAlert } from './MissingModelAlert';
import { ApiClientError } from '@/lib/api';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useMcpServers } from '@/queries/mcp';

interface Props {
  chatId: string;
  initialMessages: MessageDto[];
  initialDocuments: DocumentDto[];
}

type AgentActivityStep =
  | { kind: 'thought'; text: string }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; result: string };

function cleanModelMarkdown(content: string) {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((part) => {
      if (part.startsWith('```')) return part;
      return part
        .replace(/_{3,}/g, ' ')
        .replace(/-{4,}/g, ' ')
        .replace(/[ \t]{2,}/g, ' ');
    })
    .join('');
}

export function ChatStream({ chatId, initialMessages, initialDocuments }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<MessageDto[]>(initialMessages);
  const [documents, setDocuments] = useState<DocumentDto[]>(initialDocuments);
  const [uploadingDocIds, setUploadingDocIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [agenticEnabled, setAgenticEnabled] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentActivity, setAgentActivity] = useState<Record<string, AgentActivityStep[]>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const send = useSendMessage(chatId);
  const { data: mcpServers } = useMcpServers();
  const uploadDoc = useUploadDocument(chatId);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingAgentRunRef = useRef(false);
  const [showMissingModel, setShowMissingModel] = useState(false);

  const handleSpeechResult = (text: string) => {
    setDraft(prev => prev + text);
  };
  const { isListening, toggleListening, supported: speechSupported } = useSpeechRecognition(handleSpeechResult);

  const enabledMcpCount = mcpServers?.filter((s) => s.enabled).length ?? 0;

  const toggleMcp = () => {
    if (!mcpEnabled && enabledMcpCount === 0) {
      toast.error('Add an MCP server in Settings first', {
        action: { label: 'Settings', onClick: () => router.push('/settings/mcp') },
      });
      return;
    }
    setMcpEnabled(!mcpEnabled);
    setMenuOpen(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMessages(initialMessages);
    setDocuments(initialDocuments);
  }, [chatId, initialMessages, initialDocuments]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (p: ChatStreamDeltaPayload) => {
      if (p.chatId !== chatId) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === p.messageId);
        if (idx === -1) return prev;
        const updated = [...prev];
        const target = { ...updated[idx]! };
        target.content = (target.content ?? '') + p.delta;
        if (p.done) {
          target.tokensIn = p.tokensIn ?? target.tokensIn;
          target.tokensOut = p.tokensOut ?? target.tokensOut;
          target.durationMs = p.durationMs ?? target.durationMs;
        }
        updated[idx] = target;
        return updated;
      });
    };
    socket.on('chat.stream.delta', handler);
    return () => {
      socket.off('chat.stream.delta', handler);
    };
  }, [chatId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages, agentActivity]);

  const runAgent = async (prompt: string) => {
    setAgentRunning(true);
    let assistantId: string | null = null;

    try {
      await runChatAgentStream(chatId, { prompt }, (evt) => {
        if (evt.type === 'user_message') {
          setMessages((prev) => [
            ...prev,
            {
              id: evt.messageId,
              chatId,
              role: 'USER',
              content: evt.content,
              modelName: null,
              tokensIn: null,
              tokensOut: null,
              durationMs: null,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        if (evt.type === 'assistant_message') {
          assistantId = evt.messageId;
          setMessages((prev) => [
            ...prev,
            {
              id: evt.messageId,
              chatId,
              role: 'ASSISTANT',
              content: '',
              modelName: null,
              tokensIn: null,
              tokensOut: null,
              durationMs: null,
              createdAt: new Date().toISOString(),
            },
          ]);
          setAgentActivity((prev) => ({ ...prev, [evt.messageId]: [] }));
        }
        if (evt.type === 'thought' && assistantId) {
          setAgentActivity((prev) => ({
            ...prev,
            [assistantId!]: [...(prev[assistantId!] ?? []), { kind: 'thought', text: evt.content }],
          }));
        }
        if (evt.type === 'tool_call' && assistantId) {
          setAgentActivity((prev) => ({
            ...prev,
            [assistantId!]: [
              ...(prev[assistantId!] ?? []),
              { kind: 'tool_call', name: evt.name, args: evt.arguments },
            ],
          }));
        }
        if (evt.type === 'tool_result' && assistantId) {
          setAgentActivity((prev) => ({
            ...prev,
            [assistantId!]: [
              ...(prev[assistantId!] ?? []),
              { kind: 'tool_result', name: evt.name, result: evt.result },
            ],
          }));
        }
        if (evt.type === 'response' && assistantId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: evt.content } : m)),
          );
        }
        if (evt.type === 'error') {
          toast.error(evt.content);
          if (assistantId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: `Error: ${evt.content}` } : m,
              ),
            );
          }
        }
        if (evt.type === 'done') {
          qc.invalidateQueries({ queryKey: ['chats', chatId] });
          qc.invalidateQueries({ queryKey: ['chats'] });
        }
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Agent failed');
    } finally {
      setAgentRunning(false);
    }
  };

  useEffect(() => {
    if (pendingAgentRunRef.current) return;
    const key = `chat-agent-run:${chatId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    pendingAgentRunRef.current = true;
    sessionStorage.removeItem(key);
    try {
      const { prompt } = JSON.parse(raw) as { prompt: string };
      if (prompt?.trim()) {
        setAgenticEnabled(true);
        void runAgent(prompt.trim());
      }
    } catch {
      pendingAgentRunRef.current = false;
    }
  }, [chatId]);

  const { items: groupedItems, pendingDocs } = useMemo(() => {
    const messageGroups = messages.map(m => ({
      message: m,
      docs: [] as DocumentDto[]
    }));

    const pending: DocumentDto[] = [];

    documents.forEach(doc => {
      const nextUserMsg = messageGroups.find(
        g => g.message.role === 'USER' && g.message.createdAt >= doc.createdAt
      );
      if (nextUserMsg) {
        nextUserMsg.docs.push(doc);
      } else {
        pending.push(doc);
      }
    });

    const items: { type: 'msg_group', data: any, date: string }[] = [];
    messageGroups.forEach(g => items.push({ type: 'msg_group', data: g, date: g.message.createdAt }));

    return {
      items: items.sort((a, b) => a.date.localeCompare(b.date)),
      pendingDocs: pending
    };
  }, [messages, documents]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File is too large (max 25MB)");
      e.target.value = '';
      return;
    }

    const fakeId = Math.random().toString(36).substring(7);
    const newDoc: DocumentDto = {
      id: fakeId,
      chatId: chatId,
      filename: file.name,
      createdAt: new Date().toISOString()
    };
    setDocuments(prev => [...prev, newDoc]);
    setUploadingDocIds(prev => [...prev, fakeId]);

    try {
      await uploadDoc.mutateAsync(file);
      setUploadingDocIds(prev => prev.filter(id => id !== fakeId));
    } catch (err: any) {
      setDocuments(prev => prev.filter(d => d.id !== fakeId));
      setUploadingDocIds(prev => prev.filter(id => id !== fakeId));
      if (err instanceof ApiClientError && err.status === 422) {
        setShowMissingModel(true);
      } else {
        toast.error(err?.message || "Failed to upload document.");
      }
    }
    
    // Reset input
    e.target.value = '';
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || agentRunning) return;
    const content = draft;
    setDraft('');

    if (agenticEnabled) {
      await runAgent(content);
      return;
    }

    const optId = Math.random().toString(36).substring(7);
    const optMsg: MessageDto = {
      id: optId,
      chatId,
      role: 'USER',
      content,
      modelName: null,
      tokensIn: null,
      tokensOut: null,
      durationMs: null,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, optMsg]);

    try {
      const res = await send.mutateAsync({ content, web_search: webSearchEnabled, mcp_enabled: mcpEnabled });
      setMessages(prev => prev.map(m => m.id === optId ? res.userMessage : m).concat(res.assistantMessage));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optId));
      toast.error('Failed to send message');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollerRef} className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {groupedItems.map((item) => {
          const group = item.data as { message: MessageDto; docs: DocumentDto[] };
          const m = group.message;

          return (
            <div
              key={`msg-${m.id}`}
              className={cn(
                'flex flex-col gap-2',
                m.role === 'USER' ? 'items-end' : 'items-start',
              )}
            >
              {group.docs.map((doc, idx) => {
                const ext = doc.filename.split('.').pop()?.toUpperCase() || 'FILE';
                const isLastDoc = idx === group.docs.length - 1;
                return (
                  <div
                    key={`doc-${doc.id}`}
                    className={cn(
                      'relative flex items-center gap-3 border border-border/50 bg-background p-1.5 pr-4 shadow-sm w-64 max-w-full',
                      'rounded-2xl rounded-tr-2xl',
                      isLastDoc ? 'rounded-br-[4px]' : 'rounded-br-[4px] mb-[-4px]',
                    )}
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px] bg-red-500 text-white">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col overflow-hidden text-left">
                      <span className="truncate text-sm font-semibold text-foreground leading-tight">
                        {doc.filename}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">{ext}</span>
                    </div>
                  </div>
                );
              })}

              {m.role === 'ASSISTANT' && (agentActivity[m.id]?.length ?? 0) > 0 && (
                <div className="max-w-[80%] flex flex-wrap gap-1.5 mb-1">
                  {agentActivity[m.id]!.map((step, i) => (
                    <span
                      key={`${m.id}-step-${i}`}
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                        step.kind === 'thought' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                        step.kind === 'tool_call' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
                        step.kind === 'tool_result' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                      )}
                    >
                      {step.kind === 'thought' && step.text}
                      {step.kind === 'tool_call' && `Tool: ${step.name}`}
                      {step.kind === 'tool_result' && `${step.name} done`}
                    </span>
                  ))}
                </div>
              )}

              <div
                className={cn(
                  'max-w-[80%] text-[15px]',
                  m.role === 'USER'
                    ? cn(
                        'bg-muted px-5 py-3 text-foreground',
                        group.docs.length > 0 ? 'rounded-2xl rounded-tr-[4px]' : 'rounded-3xl',
                      )
                    : 'text-foreground',
                )}
              >
                {m.role === 'ASSISTANT' && !m.content ? (
                  <div className="flex items-center gap-1.5 h-6 text-muted-foreground/70">
                    <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className={cn("prose prose-neutral dark:prose-invert max-w-none break-words prose-pre:whitespace-pre-wrap prose-pre:break-words", m.role === 'USER' && "prose-p:my-0 prose-p:leading-snug")}
                    components={{
                      code: ({ children, className }) => (
                        <code className={cn('rounded bg-black/10 px-1 py-0.5 font-mono text-xs', className)}>
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {m.role === 'ASSISTANT' ? cleanModelMarkdown(m.content) : m.content}
                  </ReactMarkdown>
                )}
                {m.role === 'ASSISTANT' && (m.tokensOut || m.durationMs) ? (
                  <div className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {m.tokensOut ? `${m.tokensOut} tok` : ''}
                    {m.tokensOut && m.durationMs ? ' · ' : ''}
                    {m.durationMs ? `${(m.durationMs / 1000).toFixed(1)}s` : ''}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={onSubmit} className="px-4 pt-3 pb-8 bg-background/95">
        <div className="max-w-4xl mx-auto relative group">
          <div className="chat-composer-glow absolute inset-0 rounded-[28px] overflow-hidden shadow-sm pointer-events-none transition-all duration-300" />
          <div className="relative z-10 flex flex-col gap-2 rounded-[28px] bg-card px-3 py-3 m-[1px] border border-transparent">
          {pendingDocs.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pt-1">
              {pendingDocs.map((doc) => {
                const ext = doc.filename.split('.').pop()?.toUpperCase() || 'FILE';
                const isUploading = uploadingDocIds.includes(doc.id);
                return (
                  <div 
                    key={doc.id} 
                    className="relative flex items-center gap-3 rounded-[20px] border border-border/50 bg-background p-1.5 pr-4 shadow-sm w-64 max-w-full"
                  >
                    <div className={cn(
                      "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px] text-white transition-colors duration-300",
                      isUploading ? "bg-muted-foreground/40" : "bg-red-500"
                    )}>
                      {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate text-sm font-semibold text-foreground leading-tight">{doc.filename}</span>
                      <span className="text-xs text-muted-foreground font-medium">{ext}</span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        // Optimistic removal (doesn't abort backend if already sent, but removes from UI)
                        setDocuments(prev => prev.filter(d => d.id !== doc.id));
                        setUploadingDocIds(prev => prev.filter(id => id !== doc.id));
                      }}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white hover:bg-gray-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative flex items-center">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".txt,.md,.csv,.json,.js,.py,.html,.css,.ts,.tsx,.pdf"
            />
            <div className="relative shrink-0 flex items-center justify-center" ref={menuRef}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMenuOpen(!menuOpen)}
                disabled={uploadDoc.isPending}
                className={cn(
                  "h-10 w-10 text-foreground hover:bg-muted/50 rounded-full relative shrink-0",
                  agenticEnabled && "text-amber-500 hover:text-amber-600 hover:bg-amber-500/10",
                  webSearchEnabled && !agenticEnabled && "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10",
                  mcpEnabled && !webSearchEnabled && !agenticEnabled && "text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
                )}
                title="Options"
              >
                {uploadDoc.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                {agenticEnabled && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-500" />
                )}
                {webSearchEnabled && !agenticEnabled && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-500" />
                )}
                {mcpEnabled && !webSearchEnabled && !agenticEnabled && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-violet-500" />
                )}
              </Button>
              {menuOpen && (
                <div className="absolute left-0 bottom-full mb-2 z-50 w-44 rounded-xl border border-border/80 bg-card p-1 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span>Attach file</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAgenticEnabled(!agenticEnabled);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      <span>Agentic mode</span>
                    </div>
                    <div className={cn(
                      "h-2 w-2 rounded-full transition-all duration-300",
                      agenticEnabled ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-muted-foreground/30"
                    )} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push('/agent/multi');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                  >
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>Multi agent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWebSearchEnabled(!webSearchEnabled);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span>Web search</span>
                    </div>
                    <div className={cn(
                      "h-2 w-2 rounded-full transition-all duration-300",
                      webSearchEnabled ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-muted-foreground/30"
                    )} />
                  </button>
                  <button
                    type="button"
                    onClick={toggleMcp}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Plug className="w-4 h-4 text-muted-foreground" />
                      <span>MCP tools</span>
                    </div>
                    <div className={cn(
                      "h-2 w-2 rounded-full transition-all duration-300",
                      mcpEnabled ? "bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "bg-muted-foreground/30"
                    )} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {agenticEnabled && (
                <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-3 w-3" />
                  <span>Agent on</span>
                  <button
                    type="button"
                    onClick={() => setAgenticEnabled(false)}
                    className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full text-amber-600 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                    aria-label="Turn off agentic mode"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {webSearchEnabled && (
                <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Globe className="h-3 w-3" />
                  <span>Web on</span>
                  <button
                    type="button"
                    onClick={() => setWebSearchEnabled(false)}
                    className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                    aria-label="Turn off web search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {mcpEnabled && (
                <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                  <Plug className="h-3 w-3" />
                  <span>MCP on</span>
                  <button
                    type="button"
                    onClick={() => setMcpEnabled(false)}
                    className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full text-violet-600 hover:bg-violet-500/20 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    aria-label="Turn off MCP tools"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask anything"
                className="min-w-0 flex-1 border-0 h-12 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
              />
            </div>
            <div className="flex items-center gap-2 pr-1">
              {speechSupported && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggleListening}
                  className={cn(
                    "h-10 w-10 rounded-full transition-all duration-300",
                    isListening 
                      ? "text-red-500 bg-red-500/10 hover:bg-red-500/20 animate-pulse" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Mic className="w-5 h-5" />
                </Button>
              )}
              <Button 
                type="submit" 
                disabled={send.isPending || agentRunning || !draft.trim() || uploadingDocIds.length > 0}
                className="h-10 w-10 rounded-full bg-black hover:bg-gray-800 text-white transition-all disabled:opacity-50"
              >
                {(send.isPending || agentRunning) ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <ArrowUp className="w-5 h-5 text-white" />}
              </Button>
            </div>
          </div>
          </div>
        </div>
      </form>
      <MissingModelAlert isOpen={showMissingModel} onOpenChange={setShowMissingModel} />
    </div>
  );
}

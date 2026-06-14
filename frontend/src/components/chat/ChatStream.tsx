'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatStreamDeltaPayload, MessageDto, DocumentDto } from '@/types/shared';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { extractTextFromPDF } from '@/lib/pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSendMessage, useUploadDocument, useChat } from '@/queries/chats';
import { Plus, Send, Loader2, FileText, X, Mic, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import { MissingModelAlert } from './MissingModelAlert';
import { ApiClientError } from '@/lib/api';

interface Props {
  chatId: string;
  initialMessages: MessageDto[];
  initialDocuments: DocumentDto[];
}

export function ChatStream({ chatId, initialMessages, initialDocuments }: Props) {
  const [messages, setMessages] = useState<MessageDto[]>(initialMessages);
  const [documents, setDocuments] = useState<DocumentDto[]>(initialDocuments);
  const [draft, setDraft] = useState('');
  const send = useSendMessage(chatId);
  const uploadDoc = useUploadDocument(chatId);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMissingModel, setShowMissingModel] = useState(false);

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
  }, [messages]);

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

    const newDoc: DocumentDto = {
      id: Math.random().toString(36).substring(7),
      chatId: chatId,
      filename: file.name,
      createdAt: new Date().toISOString()
    };
    setDocuments(prev => [...prev, newDoc]);

    try {
      toast.loading(`Processing ${file.name}...`, { id: "upload" });
      await uploadDoc.mutateAsync(file);
      toast.success(`Successfully uploaded and processed ${file.name}`, { id: "upload" });
    } catch (err: any) {
      setDocuments(prev => prev.filter(d => d.id !== newDoc.id));
      toast.dismiss("upload");
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
    if (!draft.trim()) return;
    const content = draft;
    setDraft('');
    
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
      const res = await send.mutateAsync(content);
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
                      "relative flex items-center gap-3 border border-border/50 bg-background p-1.5 pr-4 shadow-sm w-64 max-w-full",
                      "rounded-2xl rounded-tr-2xl",
                      isLastDoc ? "rounded-br-[4px]" : "rounded-br-[4px] mb-[-4px]"
                    )}
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px] bg-red-500 text-white">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col overflow-hidden text-left">
                      <span className="truncate text-sm font-semibold text-foreground leading-tight">{doc.filename}</span>
                      <span className="text-xs text-muted-foreground font-medium">{ext}</span>
                    </div>
                  </div>
                );
              })}
              
              <div
                className={cn(
                  'max-w-[80%] text-[15px]',
                  m.role === 'USER'
                    ? cn(
                        'bg-muted px-5 py-3 text-foreground',
                        group.docs.length > 0 ? 'rounded-2xl rounded-tr-[4px]' : 'rounded-3xl'
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
                    className={cn("prose prose-neutral dark:prose-invert max-w-none", m.role === 'USER' && "prose-p:my-0 prose-p:leading-snug")}
                    components={{
                      code: ({ children, className }) => (
                        <code className={cn('rounded bg-black/10 px-1 py-0.5 font-mono text-xs', className)}>
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {m.content}
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
      <form onSubmit={onSubmit} className="p-4 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-2 rounded-[28px] border border-border/50 bg-card px-3 py-3 shadow-sm">
          {pendingDocs.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pt-1">
              {pendingDocs.map((doc) => {
                const ext = doc.filename.split('.').pop()?.toUpperCase() || 'FILE';
                return (
                  <div 
                    key={doc.id} 
                    className="relative flex items-center gap-3 rounded-[20px] border border-border/50 bg-background p-1.5 pr-4 shadow-sm w-64 max-w-full"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px] bg-red-500 text-white">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate text-sm font-semibold text-foreground leading-tight">{doc.filename}</span>
                      <span className="text-xs text-muted-foreground font-medium">{ext}</span>
                    </div>
                    <button 
                      type="button"
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadDoc.isPending}
              className="h-10 w-10 text-foreground hover:bg-muted/50 rounded-full"
              title="Attach Document"
            >
              {uploadDoc.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </Button>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask anything"
              className="flex-1 border-0 h-12 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
            />
            <div className="flex items-center gap-2 pr-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
              >
                <Mic className="w-5 h-5" />
              </Button>
              <Button 
                type="submit" 
                disabled={send.isPending || !draft.trim()}
                className="h-10 w-10 rounded-full bg-black hover:bg-gray-800 text-white transition-all disabled:opacity-50"
              >
                {send.isPending ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <ArrowUp className="w-5 h-5 text-white" />}
              </Button>
            </div>
          </div>
        </div>
      </form>
      <MissingModelAlert isOpen={showMissingModel} onOpenChange={setShowMissingModel} />
    </div>
  );
}

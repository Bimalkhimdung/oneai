'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatStreamDeltaPayload, MessageDto } from '@/types/shared';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSendMessage } from '@/queries/chats';

interface Props {
  chatId: string;
  initialMessages: MessageDto[];
}

export function ChatStream({ chatId, initialMessages }: Props) {
  const [messages, setMessages] = useState<MessageDto[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const send = useSendMessage(chatId);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMessages(initialMessages), [chatId, initialMessages]);

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

  const ordered = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const content = draft;
    setDraft('');
    const res = await send.mutateAsync(content);
    setMessages((prev) => [...prev, res.userMessage, res.assistantMessage]);
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
        {ordered.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex',
              m.role === 'USER' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-3 text-sm',
                m.role === 'USER'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ children, className }) => (
                    <code className={cn('rounded bg-black/10 px-1 py-0.5 font-mono text-xs', className)}>
                      {children}
                    </code>
                  ),
                }}
              >
                {m.content || ' '}
              </ReactMarkdown>
              {m.role === 'ASSISTANT' && (m.tokensOut || m.durationMs) ? (
                <div className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {m.tokensOut ? `${m.tokensOut} tok` : ''}
                  {m.tokensOut && m.durationMs ? ' · ' : ''}
                  {m.durationMs ? `${(m.durationMs / 1000).toFixed(1)}s` : ''}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t pt-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
        />
        <Button type="submit" disabled={send.isPending || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

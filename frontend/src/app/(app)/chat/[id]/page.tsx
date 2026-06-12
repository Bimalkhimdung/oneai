'use client';

import { useParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useChat } from '@/queries/chats';
import { ChatStream } from '@/components/chat/ChatStream';

export default function ChatDetailPage() {
  useSocket();
  const params = useParams<{ id: string }>();
  const { data: chat, isLoading } = useChat(params.id);

  if (isLoading || !chat) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <h1 className="mb-3 text-xl font-semibold">{chat.title}</h1>
      <div className="flex-1 overflow-hidden">
        <ChatStream chatId={chat.id} initialMessages={chat.messages} />
      </div>
    </div>
  );
}

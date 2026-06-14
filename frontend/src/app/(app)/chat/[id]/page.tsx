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
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 overflow-hidden relative">
        <ChatStream chatId={chat.id} initialMessages={chat.messages} initialDocuments={chat.documents || []} />
      </div>
    </div>
  );
}

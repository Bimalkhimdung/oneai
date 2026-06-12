'use client';

import Link from 'next/link';
import { useSocket } from '@/hooks/useSocket';
import { useChats } from '@/queries/chats';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ChatIndexPage() {
  useSocket();
  const { data: chats, isLoading } = useChats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chat</h1>
          <p className="text-sm text-muted-foreground">
            Your recent conversations across all models.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !chats || chats.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No chats yet</CardTitle>
            <CardDescription>
              Connect a server, install a model, then start your first conversation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/servers">Connect a server</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-md border">
          {chats.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <Link href={`/chat/${c.id}`} className="text-sm font-medium hover:underline">
                {c.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                {new Date(c.updatedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

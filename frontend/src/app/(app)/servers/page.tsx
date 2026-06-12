'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useServers, useDeleteServer } from '@/queries/servers';
import { toast } from 'sonner';

export default function ServersPage() {
  const { data: servers, isLoading } = useServers();
  const del = useDeleteServer();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI Servers</h1>
          <p className="text-sm text-muted-foreground">
            Connect on-premise model sources like Ollama.
          </p>
        </div>
        <Button asChild>
          <Link href="/servers/new">Add server</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !servers || servers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No servers yet</CardTitle>
            <CardDescription>
              Add your first AI server to start installing and chatting with models.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/servers/new">Add your first server</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{s.name}</span>
                  <StatusBadge status={s.status} />
                </CardTitle>
                <CardDescription>
                  {s.provider} · {s.host}:{s.port}
                  {s.version ? ` · v${s.version}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    del.mutate(s.id, {
                      onSuccess: () => toast.success('Server removed'),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ONLINE: 'bg-emerald-500',
    OFFLINE: 'bg-zinc-400',
    ERROR: 'bg-red-500',
    UNKNOWN: 'bg-amber-500',
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${map[status] ?? 'bg-zinc-400'}`} />
      {status.toLowerCase()}
    </span>
  );
}

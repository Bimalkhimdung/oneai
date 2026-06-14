'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useMcpServers,
  useCreateMcpServer,
  useUpdateMcpServer,
  useDeleteMcpServer,
  useTestMcpServer,
} from '@/queries/mcp';
import { cn } from '@/lib/utils';
import { Plug, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { McpServerDto, McpTransport } from '@/types/shared';

const EXAMPLE_STDIO = {
  name: 'Filesystem',
  command: 'npx',
  args: '-y @modelcontextprotocol/server-filesystem /tmp',
};

export default function McpSettingsPage() {
  const { data: servers, isLoading } = useMcpServers();
  const createServer = useCreateMcpServer();
  const updateServer = useUpdateMcpServer();
  const deleteServer = useDeleteMcpServer();
  const testServer = useTestMcpServer();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<McpTransport>('STDIO');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [url, setUrl] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setTransport('STDIO');
    setCommand('');
    setArgsText('');
    setUrl('');
  }

  function applyExample() {
    setName(EXAMPLE_STDIO.name);
    setTransport('STDIO');
    setCommand(EXAMPLE_STDIO.command);
    setArgsText(EXAMPLE_STDIO.args);
    setUrl('');
    setShowForm(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const args = argsText
      .split(/\s+/)
      .map((a) => a.trim())
      .filter(Boolean);

    try {
      await createServer.mutateAsync({
        name: name.trim(),
        transport,
        command: transport === 'STDIO' ? command.trim() : undefined,
        args: transport === 'STDIO' && args.length > 0 ? args : undefined,
        url: transport === 'SSE' ? url.trim() : undefined,
        enabled: true,
      });
      toast.success('MCP server added');
      resetForm();
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add MCP server');
    }
  }

  async function handleToggleEnabled(server: McpServerDto) {
    try {
      await updateServer.mutateAsync({
        id: server.id,
        input: { enabled: !server.enabled },
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update MCP server');
    }
  }

  async function handleTest(server: McpServerDto) {
    setTestingId(server.id);
    try {
      const result = await testServer.mutateAsync(server.id);
      if (result.ok) {
        toast.success(`Connected — ${result.toolCount} tool(s), ${result.resourceCount} resource(s)`);
      } else {
        toast.error(result.error || 'Connection failed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteServer.mutateAsync(id);
      toast.success('MCP server removed');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete MCP server');
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-medium flex items-center gap-2">
          <Plug className="h-5 w-5 text-violet-500" />
          MCP Servers
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect Model Context Protocol servers to extend chat with external tools.
          Enable MCP from the <Link href="/chat" className="text-primary hover:underline">chat + menu</Link>.
        </p>
      </div>

      <Card className="border-muted/40 rounded-[1px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick start</CardTitle>
          <CardDescription className="text-xs">
            Example stdio server (requires Node.js): filesystem access under <code className="text-[11px]">/tmp</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={applyExample}>
            Use example config
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Your servers</h3>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => {
            resetForm();
            setShowForm((v) => !v);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add server
        </Button>
      </div>

      {showForm && (
        <Card className="border-violet-500/20 rounded-[1px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New MCP server</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My MCP server" className="h-9 text-sm" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Transport</label>
                  <select
                    value={transport}
                    onChange={(e) => setTransport(e.target.value as McpTransport)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="STDIO">STDIO (local process)</option>
                    <option value="SSE">SSE (remote URL)</option>
                  </select>
                </div>
              </div>

              {transport === 'STDIO' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Command</label>
                    <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" className="h-9 text-sm" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Arguments (space-separated)</label>
                    <Input
                      value={argsText}
                      onChange={(e) => setArgsText(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                      className="h-9 text-sm font-mono text-xs"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Server URL</label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8080/sse" className="h-9 text-sm" required />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={createServer.isPending} className="h-8 text-xs">
                  {createServer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save server'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading MCP servers...
        </div>
      ) : !servers?.length ? (
        <Card className="border-dashed rounded-[1px]">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No MCP servers configured yet. Add one to use tools in chat.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => (
            <Card key={server.id} className={cn('rounded-[1px] border-muted/40', !server.enabled && 'opacity-60')}>
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-violet-500 shrink-0" />
                    <span className="font-medium text-sm truncate">{server.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1.5 py-0.5">
                      {server.transport}
                    </span>
                    {server.enabled ? (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3" /> enabled
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <AlertCircle className="h-3 w-3" /> disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {server.transport === 'STDIO'
                      ? `${server.command} ${(server.args || []).join(' ')}`
                      : server.url}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => handleToggleEnabled(server)}
                  >
                    {server.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleTest(server)}
                    disabled={testingId === server.id}
                    title="Test connection"
                  >
                    {testingId === server.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete MCP server?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes &quot;{server.name}&quot; from your account. Chat will no longer use its tools.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(server.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

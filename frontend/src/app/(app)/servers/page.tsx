'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useServers, useDeleteServer } from '@/queries/servers';
import { toast } from 'sonner';
import { Server, Plus, Network, Cpu, Trash2, PowerOff, CheckCircle2, AlertCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ServersPage() {
  const { data: servers, isLoading } = useServers();
  const del = useDeleteServer();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    del.mutate(id, {
      onSuccess: () => {
        toast.success('Server removed');
        setConfirmDelete(null);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[1px] bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Network className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Inference Nodes</h2>
            <p className="text-sm text-muted-foreground">Manage your on-premise model execution environments.</p>
          </div>
        </div>
        <Button asChild className="rounded-[1px] gap-2 shrink-0">
          <Link href="/servers/new">
            <Plus className="w-4 h-4" />
            Connect Server
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="rounded-[1px] bg-card/20 border-border/30 h-[140px] animate-pulse" />
          ))}
        </div>
      ) : !servers || servers.length === 0 ? (
        <div className="rounded-[1px] border border-dashed border-border/50 bg-card/20 p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">No execution nodes connected</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Connect your local Ollama or vLLM instances to start running models and processing inference requests securely on your own hardware.
          </p>
          <Button asChild className="rounded-[1px] gap-2">
            <Link href="/servers/new">
              <Plus className="w-4 h-4" />
              Add your first server
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {servers.map((s) => (
            <Card key={s.id} className="rounded-[1px] bg-card/40 backdrop-blur-sm border-border/50 hover:border-primary/40 hover:bg-card/60 transition-all duration-300 overflow-hidden relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <CardHeader className="pb-3 border-b border-border/30 bg-card/50">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-[1px] bg-primary/10 text-primary">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-semibold tracking-tight">{s.name}</CardTitle>
                      <CardDescription className="text-xs uppercase tracking-wider font-medium mt-0.5">
                        {s.provider} Engine
                      </CardDescription>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </CardHeader>
              <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Endpoint</div>
                  <div className="text-sm font-mono text-foreground bg-black/20 px-2.5 py-1.5 rounded-[1px] inline-block border border-border/30 shadow-inner">
                    {s.host}:{s.port}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-[1px] text-destructive hover:text-destructive hover:bg-destructive/10 border-border/50 transition-colors"
                    onClick={() => setConfirmDelete(s.id)}
                  >
                    <Trash2 className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Disconnect</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border shadow-2xl rounded-[1px] w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Disconnect Server?</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to remove this inference node? Any models that are exclusively available on this node will no longer be accessible for chats.
              </p>
              
              <div className="flex justify-end gap-3">
                <Button variant="outline" className="rounded-[1px]" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  className="rounded-[1px] gap-2"
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={del.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                  {del.isPending ? 'Removing...' : 'Disconnect'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const fallback = { color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: AlertCircle };
  const map: Record<string, { color: string; icon: LucideIcon }> = {
    ONLINE: { color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
    OFFLINE: { color: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20', icon: PowerOff },
    ERROR: { color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: AlertCircle },
    UNKNOWN: fallback,
  };
  
  const config = map[status] ?? fallback;
  const Icon = config.icon;
  
  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[1px] border text-xs font-semibold tracking-wide", config.color)}>
      <Icon className="w-3.5 h-3.5" />
      {status}
    </div>
  );
}

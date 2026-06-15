'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateServer, useTestServer } from '@/queries/servers';
import { ApiClientError } from '@/lib/api';
import { Server, Globe, Hash, Key, Activity, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const PROVIDERS = [
  { value: 'OLLAMA', label: 'Ollama', logo: '/logo/onboarding/ollama.webp', description: 'High-performance local inference API.', disabled: false },
  { value: 'LLAMA_CPP', label: 'Llama.cpp', logo: '/logo/onboarding/llamacpp.svg', description: 'Direct C/C++ model execution.', disabled: true },
  { value: 'VLLM', label: 'vLLM', logo: '/logo/onboarding/vllm.svg', description: 'High-throughput serving engine.', disabled: true },
  { value: 'LM_STUDIO', label: 'LM Studio', logo: '/logo/onboarding/lmstudio.svg', description: 'Cross-platform GUI runner.', disabled: true },
];

export default function NewServerPage() {
  const router = useRouter();
  const create = useCreateServer();
  const test = useTestServer();

  const isDocker = process.env.NEXT_PUBLIC_IS_DOCKER === 'true';

  const [form, setForm] = useState({
    name: '',
    host: isDocker ? 'host.docker.internal' : 'localhost',
    port: 11434,
    provider: 'OLLAMA' as const,
    apiKey: '',
  });

  const [discoveredModels, setDiscoveredModels] = useState<any[] | null>(null);

  const update =
    <K extends keyof typeof form>(key: K) =>
    (value: (typeof form)[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const [isAutoTesting, setIsAutoTesting] = useState(false);

  // Auto-fetch models for localhost/127.0.0.1 without requiring manual click
  useEffect(() => {
    if (!form.host || !form.port) return;
    
    const checkConnection = async () => {
      setIsAutoTesting(true);
      try {
        const res = await test.mutateAsync({
          host: form.host,
          port: Number(form.port),
          provider: form.provider,
          apiKey: form.apiKey || undefined,
        });
        if (res.ok && res.models) {
          setDiscoveredModels(res.models);
        } else {
          setDiscoveredModels(null);
        }
      } catch (e) {
        setDiscoveredModels(null);
      } finally {
        setIsAutoTesting(false);
      }
    };

    const timeout = setTimeout(checkConnection, 800);
    return () => clearTimeout(timeout);
  }, [form.host, form.port, form.provider, form.apiKey]);

  async function onTest() {
    try {
      setDiscoveredModels(null);
      const res = await test.mutateAsync({
        host: form.host,
        port: Number(form.port),
        provider: form.provider,
        apiKey: form.apiKey || undefined,
      });
      if (res.ok) {
        toast.success(`Connected successfully — Ollama v${res.version ?? 'unknown'}`);
        if (res.models) {
          setDiscoveredModels(res.models);
        }
      } else {
        toast.error(res.error ?? 'Could not connect to endpoint');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Connection test failed');
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        name: form.name,
        host: form.host,
        port: Number(form.port),
        provider: form.provider,
        apiKey: form.apiKey || undefined,
      });
      toast.success('Server node connected');
      router.push('/servers');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.payload.message : 'Could not save server configuration';
      toast.error(msg);
    }
  }

  return (
    <div className="w-full max-w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <Link href="/servers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Inference Nodes
      </Link>

      <Card className="rounded-[1px] border-border/40 bg-card/40 backdrop-blur-md shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-blue-500/50" />
        
        <CardHeader className="pb-8 pt-8 px-8 bg-card/60 border-b border-border/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[1px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Server className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold tracking-tight">Connect Inference Node</CardTitle>
              <CardDescription className="text-base mt-1">
                Configure a new local or remote execution endpoint.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-8">
          <form onSubmit={onSubmit} className="space-y-8">
            
            {/* Provider Selection */}
            <div className="space-y-4">
              <label className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">1. Select Provider Engine</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PROVIDERS.filter(p => !p.disabled).map((p) => (
                  <div
                    key={p.value}
                    onClick={() => update('provider')(p.value as any)}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-[1px] border transition-all duration-300 relative overflow-hidden cursor-pointer",
                      form.provider === p.value 
                        ? "bg-primary/5 border-primary ring-1 ring-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]" 
                        : "bg-card/40 hover:bg-card/80 hover:border-border/80 border-border/40"
                    )}
                  >
                    {form.provider === p.value && (
                      <div className="absolute top-0 right-0 w-12 h-12 bg-primary/10 blur-xl rounded-full pointer-events-none" />
                    )}
                    <div className={cn("w-10 h-10 rounded-[1px] bg-background border flex items-center justify-center shrink-0 p-1.5", form.provider === p.value ? "border-primary/30" : "border-border/50")}>
                      <img src={p.logo} alt={p.label} className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        {p.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-border/40" />

            {/* Connection Details */}
            <div className="space-y-4">
              <label className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">2. Connection Details</label>
              
              <div className="grid gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Node Display Name</label>
                  <Input
                    required
                    placeholder="e.g., Local MacBook Pro"
                    value={form.name}
                    onChange={(e) => update('name')(e.target.value)}
                    className="rounded-[1px] bg-background/50 border-border/50 focus-visible:ring-primary/20 h-11"
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2 relative">
                    <label className="text-xs font-medium text-foreground">Hostname / IP Address</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        required
                        value={form.host}
                        onChange={(e) => update('host')(e.target.value)}
                        className="rounded-[1px] pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/20 h-11 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 relative">
                    <label className="text-xs font-medium text-foreground">Port</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        required
                        type="number"
                        value={form.port}
                        onChange={(e) => update('port')(Number(e.target.value))}
                        className="rounded-[1px] pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/20 h-11 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>

                {form.provider !== 'OLLAMA' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground">API Key</label>
                      <span className="text-[10px] text-muted-foreground">Optional</span>
                    </div>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="••••••••••••••••"
                        value={form.apiKey}
                        onChange={(e) => update('apiKey')(e.target.value)}
                        className="rounded-[1px] pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/20 h-11 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Discovered Models */}
            {discoveredModels !== null && (
              <>
                <div className="w-full h-px bg-border/40" />
                <div className="space-y-4 animate-in fade-in duration-500">
                  <label className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                    3. Local Models Found ({discoveredModels.length})
                  </label>
                  
                  {discoveredModels.length === 0 ? (
                    <div className="text-sm text-muted-foreground bg-card/50 border border-border/50 p-4 rounded-[1px] text-center">
                      No installed models found on this node. You can download some from the Models library later.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {discoveredModels.map((m, idx) => (
                        <div key={idx} className="flex flex-col bg-background/50 border border-primary/50 p-3 rounded-[1px] shadow-sm relative overflow-hidden group">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary transition-colors" />
                          <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-primary flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-background rounded-full" />
                          </div>
                          <div className="font-medium text-sm text-foreground truncate pl-1 pr-4" title={m.name}>{m.name}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 pl-1">
                            {m.sizeBytes ? (m.sizeBytes / (1024 ** 3)).toFixed(1) + ' GB' : 'Unknown Size'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    All of these selected models will be automatically synchronized and available for chat.
                  </p>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="pt-6 mt-6 border-t border-border/40 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={onTest}
                disabled={test.isPending || isAutoTesting}
                className="rounded-[1px] h-11 px-6 border-border/60 hover:bg-card/80 transition-colors"
              >
                {test.isPending || isAutoTesting ? (
                  <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-pulse" /> Testing...</span>
                ) : (
                  <span className="flex items-center gap-2"><Activity className="w-4 h-4" /> Test Connection</span>
                )}
              </Button>
              <Button 
                type="submit" 
                disabled={create.isPending}
                className="rounded-[1px] h-11 px-8 shadow-lg shadow-primary/20"
              >
                {create.isPending ? 'Connecting...' : 'Connect Node'}
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}

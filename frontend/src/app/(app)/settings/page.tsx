'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Download, Terminal, CheckCircle2, AlertCircle, RefreshCw, Cpu } from 'lucide-react';
import { toast } from 'sonner';

interface ProviderInstallInfo {
  status: 'idle' | 'installing' | 'completed' | 'installed' | 'failed';
  logs: string[];
  progress: number;
}

interface InstallationsResponse {
  [key: string]: ProviderInstallInfo;
}

function Badge({ children, className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" | "destructive" | "outline" }) {
  const variantStyles = {
    default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
    outline: "text-foreground",
  };
  return (
    <div className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", variantStyles[variant], className)} {...props}>
      {children}
    </div>
  );
}

function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${value || 0}%` }}
      />
    </div>
  );
}

const PROVIDERS = [
  {
    id: 'OLLAMA',
    name: 'Ollama',
    description: 'Run language models locally with a simple, high-performance API. Highly recommended for Mac users.',
    icon: Download,
  },
  {
    id: 'LLAMA_CPP',
    name: 'Llama.cpp',
    description: 'LLM inference in C/C++ with Metal acceleration. Supports raw GGUF files directly.',
    icon: Cpu,
  },
  {
    id: 'VLLM',
    name: 'vLLM',
    description: 'A high-throughput and memory-efficient LLM serving engine. Best suited for high-end server configurations.',
    icon: Terminal,
  },
];

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [installations, setInstallations] = useState<InstallationsResponse | null>(null);
  const [activeLogsProvider, setActiveLogsProvider] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Poll installations status while any is installing
  useEffect(() => {
    let interval: NodeJS.Timeout;

    async function fetchStatuses() {
      try {
        const data = await api<InstallationsResponse>('/settings/installations');
        setInstallations(data);
      } catch (err) {
        console.error('Failed to fetch installation statuses', err);
      }
    }

    fetchStatuses();
    interval = setInterval(fetchStatuses, 2000);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (activeLogsProvider && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [installations, activeLogsProvider]);

  async function handleInstall(providerId: string) {
    try {
      toast.info(`Starting installation of ${providerId}...`);
      await api('/settings/install', {
        method: 'POST',
        body: JSON.stringify({ provider: providerId }),
      });
      setActiveLogsProvider(providerId);
    } catch (err: any) {
      toast.error(err?.message || `Failed to trigger installation for ${providerId}`);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'installed':
      case 'completed':
        return <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30 gap-1 flex items-center"><CheckCircle2 className="h-3.5 w-3.5" /> Installed</Badge>;
      case 'installing':
        return <Badge className="bg-blue-500/15 text-blue-500 hover:bg-blue-500/20 border-blue-500/30 gap-1 flex items-center animate-pulse"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Installing</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1 flex items-center"><AlertCircle className="h-3.5 w-3.5" /> Failed</Badge>;
      default:
        return <Badge variant="outline">Not Installed</Badge>;
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your workspace, profiles, and local model providers.
        </p>
      </div>

      {/* User profile card */}
      <Card className="border-muted/40 shadow-sm">
        <CardHeader>
          <CardTitle>Workspace Profile</CardTitle>
          <CardDescription>Personal details and workspace role settings.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Full Name</span>
            <p className="text-sm font-medium">{user?.fullName || '—'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Email Address</span>
            <p className="text-sm font-medium">{user?.email || '—'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Workspace Role</span>
            <p className="text-sm font-medium">
              <Badge variant="secondary" className="capitalize">{user?.role?.toLowerCase() || 'Member'}</Badge>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Local AI installer cards */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Local AI Provider Installers</h2>
          <p className="text-sm text-muted-foreground">
            Download and install backend runtime servers directly to this host machine.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const Icon = provider.icon;
            const info = installations?.[provider.id] || { status: 'idle', logs: [], progress: 0 };
            const isInstalling = info.status === 'installing';

            return (
              <Card key={provider.id} className="flex flex-col justify-between border-muted/40 shadow-sm relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="p-2 bg-primary/10 text-primary rounded-lg">
                      <Icon className="h-5 w-5" />
                    </div>
                    {getStatusBadge(info.status)}
                  </div>
                  <CardTitle className="pt-2 text-base font-semibold">{provider.name}</CardTitle>
                  <CardDescription className="text-xs leading-normal min-h-[50px]">{provider.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {isInstalling && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Installing...</span>
                        <span>{info.progress}%</span>
                      </div>
                      <Progress value={info.progress} className="h-1.5" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      className="w-full text-xs h-8"
                      variant={info.status === 'installed' || info.status === 'completed' ? 'outline' : 'default'}
                      onClick={() => handleInstall(provider.id)}
                      disabled={isInstalling}
                    >
                      {info.status === 'installed' || info.status === 'completed' ? 'Reinstall' : 'Install locally'}
                    </Button>

                    {info.logs.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setActiveLogsProvider(activeLogsProvider === provider.id ? null : provider.id)}
                      >
                        {activeLogsProvider === provider.id ? 'Hide logs' : 'View logs'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Live installer log output terminal console */}
      {activeLogsProvider && installations?.[activeLogsProvider] && (
        <Card className="border-neutral-800 bg-neutral-950 text-neutral-200 font-mono shadow-xl">
          <CardHeader className="border-b border-neutral-900 pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-neutral-400 font-semibold ml-2">Terminal Logs: {activeLogsProvider}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] text-neutral-400 hover:text-white hover:bg-neutral-900"
              onClick={() => setActiveLogsProvider(null)}
            >
              Close Console
            </Button>
          </CardHeader>
          <CardContent className="p-4 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800">
            <pre className="text-xs whitespace-pre-wrap leading-relaxed select-all">
              {installations[activeLogsProvider].logs.length === 0
                ? 'Queueing installation task...'
                : installations[activeLogsProvider].logs.join('')}
            </pre>
            <div ref={logsEndRef} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

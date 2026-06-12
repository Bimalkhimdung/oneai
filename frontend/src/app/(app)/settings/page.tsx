'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Download, Terminal, CheckCircle2, AlertCircle, RefreshCw, Cpu, Database } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface ProviderInstallInfo {
  status: 'idle' | 'installing' | 'completed' | 'installed' | 'failed';
  logs: string[];
  progress: number;
}

interface InstallationsResponse {
  [key: string]: ProviderInstallInfo;
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

import { Progress } from '@/components/ui/progress';

const PROVIDERS = [
  {
    id: 'OLLAMA',
    name: 'Ollama',
    description: 'Run language models locally with a simple, high-performance API. Highly recommended for Mac users.',
    logo: '/logo/onboarding/ollama.webp',
  },
  {
    id: 'LLAMA_CPP',
    name: 'Llama.cpp',
    description: 'LLM inference in C/C++ with Metal acceleration. Supports raw GGUF files directly.',
    logo: '/logo/onboarding/llamacpp.svg',
  },
  {
    id: 'VLLM',
    name: 'vLLM',
    description: 'A high-throughput and memory-efficient LLM serving engine. Best suited for high-end server configurations.',
    logo: '/logo/onboarding/vllm.svg',
  },
];

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [installations, setInstallations] = useState<InstallationsResponse | null>(null);
  const [activeLogsProvider, setActiveLogsProvider] = useState<string | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [hasSetDefault, setHasSetDefault] = useState(false);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch and auto-selection
  useEffect(() => {
    async function fetchStatuses() {
      try {
        const data = await api<InstallationsResponse>('/settings/installations');
        setInstallations(data);

        // Auto-select the installed engine if we haven't checked yet
        if (!selectedEngine && !hasSetDefault) {
          const installedProvider = PROVIDERS.find(
            (p) => data[p.id]?.status === 'installed' || data[p.id]?.status === 'completed'
          );
          if (installedProvider) {
            setSelectedEngine(installedProvider.id);
            setHasSetDefault(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch installation statuses', err);
      }
    }
    fetchStatuses();
  }, [selectedEngine, hasSetDefault]);

  // Derived state to check if any provider is actively installing
  const isAnyInstalling = useMemo(() => {
    if (!installations) return false;
    return Object.values(installations).some(info => info.status === 'installing');
  }, [installations]);

  // Poll installations only when an installation is actively running
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isAnyInstalling) {
      interval = setInterval(async () => {
        try {
          const data = await api<InstallationsResponse>('/settings/installations');
          setInstallations(data);
        } catch (err) { }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAnyInstalling]);

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

      // Locally trigger installing state so polling begins
      setInstallations(prev => ({
        ...prev,
        [providerId]: { status: 'installing', logs: [], progress: 0 }
      }));
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

      {/* Local AI installer cards */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Local AI Provider Installers</h2>
          <p className="text-sm text-muted-foreground">
            Download and install backend runtime servers directly to this host machine.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PROVIDERS.filter((p) => (selectedEngine ? p.id === selectedEngine : true)).map((provider) => {
            const info = installations?.[provider.id] || { status: 'idle', logs: [], progress: 0 };
            const isInstalling = info.status === 'installing';

            return (
              <div key={provider.id} className="col-span-1 flex flex-col">
                {selectedEngine === provider.id && (
                  <div className="flex justify-between items-center px-1 mb-3 animate-in fade-in duration-300">
                    <span className="text-xs text-muted-foreground font-medium">Selected Engine</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-xs h-7 px-3 flex items-center gap-1.5 shadow-sm"
                      onClick={() => setSelectedEngine(null)}
                    >
                      Change engine →
                    </Button>
                  </div>
                )}

                <Card
                  className={cn(
                    "flex flex-col justify-between border-muted/40 shadow-sm relative overflow-hidden h-full cursor-pointer transition-all hover:border-primary/30 rounded-[1px]",
                    selectedEngine === provider.id ? "border-primary/50 shadow-md ring-1 ring-primary/20" : ""
                  )}
                  onClick={() => !selectedEngine && setSelectedEngine(provider.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="p-1.5 bg-card/60 border border-border/40 rounded-lg">
                        <img src={provider.logo} alt={provider.name} className="h-6 w-6 object-contain" />
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

                      {selectedEngine === 'OLLAMA' && provider.id === 'OLLAMA' && (
                        <Link href="/settings/ollama/models" className="w-full">
                          <Button
                            variant="secondary"
                            className="w-full text-xs h-8 flex gap-1.5"
                          >
                            <Database className="h-3 w-3" />
                            Browse Models
                          </Button>
                        </Link>
                      )}

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
              </div>
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

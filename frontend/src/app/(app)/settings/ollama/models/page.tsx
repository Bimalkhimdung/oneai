'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Download, CheckCircle2, RefreshCw, Search, Database, ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';

interface ProviderInstallInfo {
  status: 'idle' | 'installing' | 'completed' | 'installed' | 'failed';
  logs: string[];
  progress: number;
}

interface InstallationsResponse {
  [key: string]: ProviderInstallInfo;
}

interface OllamaModel {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  size?: string;
}

export default function OllamaModelsPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [installations, setInstallations] = useState<InstallationsResponse | null>(null);
  const [activeLogsProvider, setActiveLogsProvider] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Model Browser State
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [confirmPullModel, setConfirmPullModel] = useState<OllamaModel | null>(null);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<OllamaModel | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string>('');

  useEffect(() => {
    setSelectedVariant('');
  }, [confirmPullModel]);

  const variants = useMemo(() => {
    if (!confirmPullModel?.tags) return [];
    return confirmPullModel.tags.filter((t: string) => /^(\d+(\.\d+)?[bmx]+)+$/i.test(t));
  }, [confirmPullModel]);

  // Initial fetch only
  useEffect(() => {
    async function fetchStatuses() {
      try {
        const data = await api<InstallationsResponse>('/settings/installations');
        setInstallations(data);
      } catch (err) {
        console.error('Failed to fetch installation statuses', err);
      }
    }
    fetchStatuses();
  }, []);

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
        } catch (err) {}
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

  // Fetch Ollama models based on search
  useEffect(() => {
    setPage(1);
    setModels([]);
  }, [searchQuery]);

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (page === 1) setIsSearching(true);
      else setIsLoadingMore(true);
      
      try {
        const res = await api<{models: OllamaModel[], has_more: boolean}>(`/settings/ollama/search?q=${encodeURIComponent(searchQuery)}&page=${page}`);
        if (page === 1) {
          setModels(res.models || []);
        } else {
          setModels(prev => {
            const newModels = [...prev];
            res.models?.forEach(m => {
              if (!newModels.find(existing => existing.id === m.id)) {
                newModels.push(m);
              }
            });
            return newModels;
          });
        }
        setHasMore(res.has_more);
      } catch (err) {
        console.error('Failed to fetch models', err);
      } finally {
        setIsSearching(false);
        setIsLoadingMore(false);
      }
    }, page === 1 ? 500 : 0);
    return () => clearTimeout(delay);
  }, [searchQuery, page]);

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const aInfo = installations?.[`OLLAMA_MODEL_${a.id}`]?.status;
      const bInfo = installations?.[`OLLAMA_MODEL_${b.id}`]?.status;
      const aInstalled = aInfo === 'installed' || aInfo === 'completed';
      const bInstalled = bInfo === 'installed' || bInfo === 'completed';
      if (aInstalled && !bInstalled) return -1;
      if (!aInstalled && bInstalled) return 1;
      return 0;
    });
  }, [models, installations]);

  const activelyPullingModelId = useMemo(() => {
    if (!installations) return null;
    for (const [key, info] of Object.entries(installations)) {
      if (info.status === 'installing' && key.startsWith('OLLAMA_MODEL_')) {
        return key.replace('OLLAMA_MODEL_', '');
      }
    }
    return null;
  }, [installations]);

  const displayedModels = activelyPullingModelId 
    ? sortedModels.filter(m => m.id === activelyPullingModelId)
    : sortedModels;

  useEffect(() => {
    if (!installations) return;
    const hasSyncedModelChange = Object.entries(installations).some(([key, info]) => (
      key.startsWith('OLLAMA_MODEL_') && (info.status === 'completed' || info.status === 'installed')
    ));
    if (hasSyncedModelChange) {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }
  }, [installations, queryClient]);

  async function handlePullModel(modelId: string, variant?: string) {
    try {
      const finalModelName = variant ? `${modelId}:${variant}` : modelId;
      const providerKey = `OLLAMA_MODEL_${modelId}`;

      await api('/settings/ollama/pull', {
        method: 'POST',
        body: JSON.stringify({ model_name: finalModelName, tracking_id: modelId }),
      });
      setActiveLogsProvider(providerKey);
      
      // Locally trigger installing state so polling begins
      setInstallations(prev => ({
        ...prev,
        [providerKey]: { status: 'installing', logs: [], progress: 0 }
      }));
    } catch (err: any) {
      toast.error(err?.message || `Failed to pull model ${modelId}`);
    }
  }

  async function handleDeleteModel(modelId: string) {
    try {
      const providerKey = `OLLAMA_MODEL_${modelId}`;
      await api('/settings/ollama/delete', {
        method: 'POST',
        body: JSON.stringify({ model_name: modelId }),
      });
      
      // Instantly clear status locally
      setInstallations(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        next[providerKey] = { status: 'idle', logs: [], progress: 0 };
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success(`Uninstalled model ${modelId}`);
    } catch (err: any) {
      toast.error(err?.message || `Failed to uninstall model ${modelId}`);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl pb-10">
      <div className="flex items-center gap-4">
        <Link href="/settings" className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
          <ArrowLeft className="h-5 w-5 text-neutral-400" />
        </Link>
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Database className="h-6 w-6 text-emerald-500" />
            Ollama Model Library
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Search, discover, and install LLMs directly to your local Ollama daemon.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          placeholder="Search models (e.g. deepseek, qwen, llama3)..." 
          className="pl-10 h-12 bg-card/50 text-base rounded-xl" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {isSearching && models.length === 0 ? (
          <div className="flex justify-center p-12 text-muted-foreground animate-pulse border border-dashed border-border/40 rounded-2xl">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Searching library...
          </div>
        ) : displayedModels.length > 0 ? (
          <div className="flex flex-col gap-3">
            {displayedModels.map((m) => {
              const providerKey = `OLLAMA_MODEL_${m.id}`;
              const info = installations?.[providerKey] || { status: 'idle', logs: [], progress: 0 };
              const isPulling = info.status === 'installing';
              const isPulled = info.status === 'completed' || info.status === 'installed';

              return (
                <div key={m.id} className={cn("flex flex-col gap-3 p-4 rounded-xl border border-border/50 transition-colors shadow-sm", isPulled ? "bg-primary/5 border-primary/20" : "bg-card/40 hover:bg-card/60 hover:shadow-md")}>
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-sm truncate flex items-center gap-2">
                          {m.name}
                          {isPulled && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        </h4>
                        {m.size && <span className="text-[11px] font-medium text-emerald-600/90 bg-emerald-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">{m.size}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-1">{m.description}</p>
                      
                      {m.tags && m.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.tags.map((t) => (
                            <span key={t} className="inline-flex items-center rounded-md bg-neutral-500/10 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end gap-2 shrink-0 w-32">
                      <div className="flex gap-2 w-full">
                        {isPulled && (
                          <Button 
                            size="icon" 
                            variant="outline"
                            className="h-8 w-8 shrink-0 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setConfirmDeleteModel(m)}
                            title="Uninstall model"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant={isPulled ? "outline" : "default"}
                          className={cn("flex-grow h-8 text-xs rounded-lg", isPulled && "text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700", !isPulled && "w-full")}
                          onClick={() => setConfirmPullModel(m)}
                          disabled={isPulling || isPulled}
                        >
                          {isPulling ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : (isPulled ? null : <Download className="h-3.5 w-3.5 mr-1.5" />)}
                          {isPulled ? 'Installed' : isPulling ? 'Pulling...' : 'Pull Model'}
                        </Button>
                      </div>
                      
                      {info.logs.length > 0 && (
                        <button 
                          className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                          onClick={() => setActiveLogsProvider(activeLogsProvider === providerKey ? null : providerKey)}
                        >
                          {activeLogsProvider === providerKey ? 'Hide logs' : 'View logs'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {isPulling && (
                    <div className="pt-1">
                      <Progress value={info.progress} className="h-1.5" />
                    </div>
                  )}

                  {activeLogsProvider === providerKey && info.logs.length > 0 && (
                    <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-200 font-mono shadow-inner overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="border-b border-neutral-900 bg-neutral-900/60 px-4 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                          <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider ml-2">Terminal</span>
                        </div>
                        <button
                          className="text-[10px] text-neutral-400 hover:text-white transition-colors uppercase tracking-wider font-medium"
                          onClick={() => setActiveLogsProvider(null)}
                        >
                          Hide Logs
                        </button>
                      </div>
                      <div className="p-4 max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800">
                        <pre className="text-[11px] whitespace-pre-wrap leading-relaxed select-all">
                          {info.logs.join('')}
                        </pre>
                        <div ref={logsEndRef} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-16 text-muted-foreground bg-card/10 rounded-2xl border border-dashed border-border/40">
            <Database className="h-10 w-10 mb-4 opacity-20" />
            <p className="text-base font-medium">No models found for "{searchQuery}"</p>
            <p className="text-sm opacity-70 mt-1">Try searching for a different name</p>
          </div>
        )}
        
        {hasMore && !isSearching && !activelyPullingModelId && (
          <div className="flex justify-center pt-6 pb-2">
            <Button 
              variant="outline" 
              onClick={() => setPage(p => p + 1)}
              disabled={isLoadingMore}
              className="w-full max-w-xs rounded-full border-dashed"
            >
              {isLoadingMore ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              {isLoadingMore ? 'Loading...' : 'Load More Models'}
            </Button>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmPullModel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-2">Confirm Installation</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to download and install this model to your local machine?
              </p>
              
              <div className="bg-muted/40 rounded-xl p-4 space-y-3 mb-6">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Model</div>
                  <div className="font-semibold text-base">{confirmPullModel.name}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Size</div>
                    <div className="text-sm font-medium">
                      {selectedVariant 
                        ? <span className="text-muted-foreground italic">Varies by parameter size</span>
                        : (confirmPullModel.size || 'Unknown (Variable)')}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Categories</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {confirmPullModel.tags && confirmPullModel.tags.length > 0 ? (
                        confirmPullModel.tags.filter(t => !variants.includes(t)).slice(0, 4).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium border border-primary/20">
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">General</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {variants.length > 0 && (
                <div className="mb-6">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Select Parameter Size</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={cn("px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors", selectedVariant === '' ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-card hover:bg-accent hover:text-foreground")}
                      onClick={() => setSelectedVariant('')}
                    >
                      Default (latest)
                    </button>
                    {variants.map(v => (
                      <button
                        key={v}
                        className={cn("px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors", selectedVariant === v ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-card hover:bg-accent hover:text-foreground")}
                        onClick={() => setSelectedVariant(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setConfirmPullModel(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    handlePullModel(confirmPullModel.id, selectedVariant);
                    setConfirmPullModel(null);
                  }}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Start Download
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Confirmation Modal */}
      {confirmDeleteModel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-destructive mb-2">Uninstall Model</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to uninstall and completely remove <strong>{confirmDeleteModel.name}</strong> from your local machine? This action cannot be undone.
              </p>
              
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setConfirmDeleteModel(null)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => {
                    handleDeleteModel(confirmDeleteModel.id);
                    setConfirmDeleteModel(null);
                  }}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Uninstall
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

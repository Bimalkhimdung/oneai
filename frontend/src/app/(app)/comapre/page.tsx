'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServers } from '@/queries/servers';
import { useCompareModels } from '@/queries/compare';
import { cn } from '@/lib/utils';
import type { CompareResultDto } from '@/types/shared';
import {
  ArrowUp,
  Check,
  GitCompare,
  Loader2,
  MessageSquare,
  PanelLeft,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

type CompareRun = {
  id: string;
  title: string;
  prompt: string;
  modelIds: string[];
  results: CompareResultDto[];
  createdAt: string;
};

const STORAGE_KEY = 'local-ai-hub:compare-runs';

function safeTitle(prompt: string) {
  const words = prompt.trim().split(/\s+/).slice(0, 7).join(' ');
  return words + (prompt.trim().split(/\s+/).length > 7 ? '...' : '');
}

export default function ComparePage() {
  const { data: servers, isLoading } = useServers();
  const compare = useCompareModels();
  const [runs, setRuns] = useState<CompareRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  const installedModels = useMemo(() => {
    return (servers || []).flatMap((server) =>
      (server.models || []).map((model) => ({
        id: model.id,
        name: model.name,
        serverName: server.name,
        provider: server.provider,
      })),
    );
  }, [servers]);

  const activeRun = activeRunId ? runs.find((run) => run.id === activeRunId) || null : null;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as CompareRun[];
      setRuns(parsed);
      setActiveRunId(parsed[0]?.id || null);
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    if (installedModels.length < 2 || selectedModelIds.length > 0) return;
    setSelectedModelIds(installedModels.slice(0, 2).map((model) => model.id));
  }, [installedModels, selectedModelIds.length]);

  function persistRuns(nextRuns: CompareRun[]) {
    setRuns(nextRuns);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRuns));
  }

  function toggleModel(modelId: string) {
    setSelectedModelIds((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId);
      }
      if (prev.length >= 5) {
        toast.error('You can compare up to 5 models at once.');
        return prev;
      }
      return [...prev, modelId];
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    if (selectedModelIds.length < 2) {
      toast.error('Select at least two models to compare.');
      return;
    }

    const submittedPrompt = prompt.trim();
    try {
      const response = await compare.mutateAsync({
        prompt: submittedPrompt,
        modelIds: selectedModelIds,
      });
      const run: CompareRun = {
        id: crypto.randomUUID(),
        title: safeTitle(submittedPrompt),
        prompt: submittedPrompt,
        modelIds: selectedModelIds,
        results: response.results,
        createdAt: new Date().toISOString(),
      };
      const nextRuns = [run, ...runs].slice(0, 30);
      persistRuns(nextRuns);
      setActiveRunId(run.id);
      setPrompt('');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to compare models.');
    }
  }

  function deleteRun(runId: string) {
    const nextRuns = runs.filter((run) => run.id !== runId);
    persistRuns(nextRuns);
    if (activeRunId === runId) {
      setActiveRunId(nextRuns[0]?.id || null);
    }
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-0 w-full overflow-hidden">
      <div
        className={cn(
          'shrink-0 border-r border-border/40 bg-card/20 flex flex-col transition-all duration-300 ease-in-out overflow-hidden',
          isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 border-r-0',
        )}
      >
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <Button
            className="flex-1 rounded-[1px] gap-2 shadow-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all mr-2"
            onClick={() => {
              setActiveRunId(null);
              setPrompt('');
            }}
          >
            <Plus className="w-4 h-4" />
            New Compare
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(false)}
            className="w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground rounded-[1px]"
            title="Close Sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 w-64">
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-4">No compare history yet</p>
          ) : (
            runs.map((run) => {
              const isActive = activeRun?.id === run.id;
              return (
                <div
                  key={run.id}
                  className={cn(
                    'group flex items-center justify-between px-3 py-2 text-sm rounded-[1px] transition-colors relative',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                  )}
                >
                  <button
                    type="button"
                    className="absolute inset-0 z-0"
                    aria-label={`Open compare ${run.title}`}
                    onClick={() => setActiveRunId(run.id)}
                  />
                  <div className="flex items-center gap-2 truncate z-10 pointer-events-none">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{run.title || 'Untitled'}</span>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      'opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive rounded-[1px] z-10',
                      isActive && 'opacity-100 text-primary/60 hover:text-destructive',
                    )}
                    onClick={() => deleteRun(run.id)}
                    aria-label="Delete compare run"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
        <div
          className={cn(
            'absolute top-4 left-4 z-50 transition-all duration-300',
            isSidebarOpen ? 'opacity-0 pointer-events-none -translate-x-4' : 'opacity-100 translate-x-0',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(true)}
            className="w-10 h-10 bg-card/50 backdrop-blur-md border border-border/50 text-muted-foreground hover:text-foreground rounded-[1px] shadow-sm hover:shadow"
            title="Open Sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[1px] bg-primary/10 border border-primary/20 flex items-center justify-center">
                <GitCompare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight">Compare Models</h2>
                <p className="text-sm text-muted-foreground">Send one prompt to multiple installed local models.</p>
              </div>
            </div>

            <section className="rounded-[1px] border border-border/50 bg-card/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Models</h3>
                  <p className="text-xs text-muted-foreground">Choose 2-5 installed models.</p>
                </div>
                <span className="text-xs text-muted-foreground">{selectedModelIds.length} selected</span>
              </div>
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading models...
                </div>
              ) : installedModels.length === 0 ? (
                <p className="text-sm text-muted-foreground">No installed models found. Connect a server and install models first.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {installedModels.map((model) => {
                    const selected = selectedModelIds.includes(model.id);
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => toggleModel(model.id)}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-[1px] border px-3 py-2 text-left transition-colors',
                          selected
                            ? 'border-primary/40 bg-primary/10 text-foreground'
                            : 'border-border/50 bg-background/40 text-muted-foreground hover:bg-card/60 hover:text-foreground',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{model.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{model.serverName} · {model.provider}</div>
                        </div>
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {activeRun ? (
              <section className="space-y-4">
                <div className="rounded-[1px] bg-muted px-5 py-3 text-[15px] text-foreground ml-auto max-w-[80%]">
                  {activeRun.prompt}
                </div>
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {activeRun.results.map((result) => (
                    <article key={result.modelId} className="relative rounded-[1px] border border-border bg-card/40 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                      <div className="absolute inset-y-0 left-0 w-px bg-primary/40" />
                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
                        <h3 className="truncate text-sm font-semibold">{result.modelName}</h3>
                        {result.durationMs ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {(result.durationMs / 1000).toFixed(1)}s
                          </span>
                        ) : null}
                      </div>
                      {result.error ? (
                        <p className="text-sm text-destructive">{result.error}</p>
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          className="prose prose-neutral dark:prose-invert max-w-none text-sm"
                          components={{
                            code: ({ children, className }) => (
                              <code className={cn('rounded bg-black/10 px-1 py-0.5 font-mono text-xs', className)}>
                                {children}
                              </code>
                            ),
                          }}
                        >
                          {result.content || '[No response]'}
                        </ReactMarkdown>
                      )}
                      {(result.tokensOut || result.tokensIn) && (
                        <div className="mt-4 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {result.tokensIn ? `${result.tokensIn} in` : ''}
                          {result.tokensIn && result.tokensOut ? ' · ' : ''}
                          {result.tokensOut ? `${result.tokensOut} out` : ''}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-[1px] border border-dashed border-border/50 bg-card/20 p-8 text-center">
                <p className="max-w-md text-sm text-muted-foreground">
                  Select at least two models, enter a prompt, and compare their responses side by side.
                </p>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={onSubmit} className="px-4 pt-3 pb-8 bg-background/95">
          <div className="chat-composer-glow max-w-4xl mx-auto relative rounded-[28px] p-[1px] overflow-hidden shadow-sm transition-all duration-300">
            <div className="relative z-10 flex items-center rounded-[28px] bg-card px-3 py-3">
              <Input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask all selected models..."
                className="min-w-0 flex-1 border-0 h-12 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
              />
              <Button
                type="submit"
                disabled={compare.isPending || !prompt.trim() || selectedModelIds.length < 2}
                className="h-10 w-10 rounded-full bg-black hover:bg-gray-800 text-white transition-all disabled:opacity-50"
                title="Compare models"
              >
                {compare.isPending ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <ArrowUp className="w-5 h-5 text-white" />}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

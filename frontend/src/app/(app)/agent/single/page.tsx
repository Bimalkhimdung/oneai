'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useServers } from '@/queries/servers';
import {
  runAgentStream,
  fetchAgentSessions,
  deleteAgentSession,
  fetchAgentTools,
} from '@/queries/agent';
import type {
  AgentSessionDto,
  AgentStreamEvent,
  ToolDefinition,
} from '@/types/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Bot,
  Loader2,
  Send,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  Brain,
  Terminal,
  Database,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

type StepItem =
  | { kind: 'thought'; content: string }
  | { kind: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; result: string };

const TOOL_ICONS: Record<string, typeof Search> = {
  web_search: Search,
  memory_recall: Brain,
  memory_store: Brain,
  run_python: Terminal,
  query_database: Database,
};

export default function SingleAgentPage() {
  const { data: servers } = useServers();
  const [sessions, setSessions] = useState<AgentSessionDto[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [cotOpen, setCotOpen] = useState(true);
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [response, setResponse] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const models = useMemo(
    () => servers?.flatMap((s) => s.models?.map((m) => m.name) ?? []) ?? [],
    [servers],
  );

  useEffect(() => {
    if (!model && models.length > 0) setModel(models[0]!);
  }, [model, models]);

  useEffect(() => {
    fetchAgentSessions().then(setSessions).catch(() => {});
    fetchAgentTools().then(setTools).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, response, running]);

  const handleEvent = (evt: AgentStreamEvent) => {
    switch (evt.type) {
      case 'thought':
        setSteps((s) => [...s, { kind: 'thought', content: evt.content }]);
        break;
      case 'tool_call':
        setSteps((s) => [...s, { kind: 'tool_call', name: evt.name, arguments: evt.arguments }]);
        break;
      case 'tool_result':
        setSteps((s) => [...s, { kind: 'tool_result', name: evt.name, result: evt.result }]);
        break;
      case 'response':
        setResponse(evt.content);
        break;
      case 'error':
        toast.error(evt.content);
        break;
      case 'done':
        if (evt.sessionId) {
          setSessionId(evt.sessionId);
          fetchAgentSessions().then(setSessions).catch(() => {});
        }
        break;
    }
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || running || !model) return;

    setRunning(true);
    setSteps([]);
    setResponse('');
    abortRef.current = new AbortController();

    try {
      await runAgentStream(
        { prompt: prompt.trim(), mode: 'single', model, session_id: sessionId },
        handleEvent,
        abortRef.current.signal,
      );
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Agent run failed');
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 -m-6 p-6">
      {/* Sessions sidebar */}
      <div className="hidden w-52 shrink-0 flex-col border-r border-border/40 pr-4 lg:flex">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sessions</p>
        <Button variant="outline" size="sm" className="mb-3 text-xs" onClick={() => {
          setSessionId(undefined);
          setSteps([]);
          setResponse('');
        }}>
          New session
        </Button>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer',
                sessionId === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground',
              )}
              onClick={() => setSessionId(s.id)}
            >
              <span className="flex-1 truncate">{s.title || 'Untitled'}</span>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteAgentSession(s.id).then(() => {
                    setSessions((x) => x.filter((y) => y.id !== s.id));
                    if (sessionId === s.id) setSessionId(undefined);
                  });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Single Agent
            </h2>
            <p className="text-sm text-muted-foreground">
              One autonomous AI agent with access to tools. Uses the ReAct reasoning loop.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm min-w-[180px]"
              disabled={running || models.length === 0}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active tools */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <span key={t.name} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
              {t.name}
            </span>
          ))}
        </div>

        {/* Agent activity / chain-of-thought */}
        {(steps.length > 0 || running) && (
          <div className="mb-3 rounded-lg border border-border/60 bg-card/50">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground"
              onClick={() => setCotOpen(!cotOpen)}
            >
              {cotOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              Agent activity
              {running && <Loader2 className="h-3 w-3 animate-spin" />}
            </button>
            {cotOpen && (
              <div className="max-h-52 overflow-y-auto border-t border-border/40 px-3 py-2 space-y-2">
                {steps.map((step, i) => {
                  if (step.kind === 'thought') {
                    return <p key={i} className="text-xs text-muted-foreground italic">{step.content}</p>;
                  }
                  if (step.kind === 'tool_call') {
                    const Icon = TOOL_ICONS[step.name] ?? Terminal;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600">
                          <Icon className="h-3 w-3" /> {step.name}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <pre key={i} className="text-[10px] bg-muted/40 rounded p-2 max-h-20 overflow-auto whitespace-pre-wrap break-words">
                      {step.result.slice(0, 400)}
                    </pre>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Response area */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-border/60 bg-card/30 p-4 mb-3">
          {response ? (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-pre:whitespace-pre-wrap prose-pre:break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {running ? 'Agent is working…' : 'Send a task to start.'}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Single agent task with tools…"
            className="flex-1"
            disabled={running || !model}
          />
          {running ? (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!prompt.trim() || !model}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

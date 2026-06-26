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
  fetchAgentSettings,
  saveAgentSettings,
} from '@/queries/agent';
import type { AgentSessionDto, AgentStreamEvent, ToolDefinition } from '@/types/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Bot, Loader2, Trash2, Search, Brain, Terminal, Database,
  Settings, X, Cpu, ArrowUp, Plus, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

/* ─── Types ─── */
type AgentStep =
  | { kind: 'thought'; text: string }
  | { kind: 'tool_call'; name: string }
  | { kind: 'tool_result'; name: string };

type Turn = {
  id: string;
  prompt: string;
  steps: AgentStep[];
  response: string;
  pending: boolean;
};

const TOOL_ICONS: Record<string, typeof Search> = {
  web_search: Search, memory_recall: Brain, memory_store: Brain,
  run_python: Terminal, query_database: Database,
};

function cleanMarkdown(content: string) {
  return content.split(/(```[\s\S]*?```)/g).map((part) => {
    if (part.startsWith('```')) return part;
    return part.replace(/_{3,}/g, ' ').replace(/-{4,}/g, ' ').replace(/[ \t]{2,}/g, ' ');
  }).join('');
}

/* ─── Settings ─── */
interface AgentSettings { model: string; systemPrompt: string; maxIterations: number; }
const DEFAULT_SETTINGS: AgentSettings = { model: '', systemPrompt: '', maxIterations: 10 };
const STORAGE_KEY = 'oneai:single-agent-settings';

function loadSettings(): AgentSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(s: AgentSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export default function SingleAgentPage() {
  const { data: servers } = useServers();
  const [sessions, setSessions] = useState<AgentSessionDto[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>(() => loadSettings());
  const [draftSettings, setDraftSettings] = useState<AgentSettings>(() => loadSettings());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const models = useMemo(
    () => servers?.flatMap((s) => s.models?.map((m) => m.name) ?? []) ?? [],
    [servers],
  );

  // Only auto-select if no model has been saved yet
  useEffect(() => {
    if (!settingsLoaded) return;
    if (settings.model || models.length === 0) return;
    const first = models[0]!;
    setSettings((s) => ({ ...s, model: first }));
    setDraftSettings((s) => ({ ...s, model: first }));
  }, [models, settings.model, settingsLoaded]);

  useEffect(() => {
    fetchAgentSessions().then(setSessions).catch(() => {});
    fetchAgentTools().then(setTools).catch(() => {});
    fetchAgentSettings()
      .then((saved) => {
        const next = { ...DEFAULT_SETTINGS, ...saved.single };
        setSettings(next);
        setDraftSettings(next);
        saveSettings(next);
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  function openSettings() { setDraftSettings(settings); setSettingsOpen(true); }
  async function applySettings() {
    if (!draftSettings.model) { toast.error('Please select a model'); return; }
    saveSettings(draftSettings);
    setSettings(draftSettings);
    try {
      const current = await fetchAgentSettings().catch(() => null);
      await saveAgentSettings({
        single: draftSettings,
        multi: current?.multi ?? {
          defaultModel: '',
          supervisorPrompt: '',
          maxRounds: 12,
          teamName: 'My Team',
          agents: [],
          teamId: null,
        },
      });
    } catch {
      toast.error('Saved locally, but failed to sync settings');
      return;
    }
    setSettingsOpen(false); toast.success('Settings applied');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt || running || !settings.model) return;

    const turnId = crypto.randomUUID();
    setDraft('');
    setTurns((t) => [...t, { id: turnId, prompt, steps: [], response: '', pending: true }]);
    setRunning(true);
    abortRef.current = new AbortController();

    const handleEvent = (evt: AgentStreamEvent) => {
      setTurns((prev) => prev.map((t) => {
        if (t.id !== turnId) return t;
        switch (evt.type) {
          case 'thought':
            return { ...t, steps: [...t.steps, { kind: 'thought', text: evt.content }] };
          case 'tool_call':
            return { ...t, steps: [...t.steps, { kind: 'tool_call', name: evt.name }] };
          case 'tool_result':
            return { ...t, steps: [...t.steps, { kind: 'tool_result', name: evt.name }] };
          case 'response':
            return { ...t, response: evt.content };
          case 'done':
            if (evt.sessionId) setSessionId(evt.sessionId);
            return { ...t, pending: false };
          default:
            return t;
        }
      }));
      if (evt.type === 'error') toast.error(evt.content);
    };

    try {
      await runAgentStream(
        { prompt, mode: 'single', model: settings.model, session_id: sessionId,
          system_prompt: settings.systemPrompt || undefined, max_iterations: settings.maxIterations },
        handleEvent, abortRef.current.signal,
      );
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Agent run failed');
      setTurns((prev) => prev.map((t) => t.id === turnId ? { ...t, pending: false } : t));
    } finally {
      setRunning(false);
      abortRef.current = null;
      fetchAgentSessions().then(setSessions).catch(() => {});
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* Sessions sidebar */}
      <div className="hidden w-52 shrink-0 flex-col border-r border-border/40 bg-card/20 p-3 lg:flex">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sessions</p>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setSessionId(undefined); setTurns([]); }}>
            New
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.id}
              className={cn('group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors',
                sessionId === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground')}
              onClick={() => setSessionId(s.id)}
            >
              <Bot className="h-3 w-3 shrink-0" />
              <span className="flex-1 truncate">{s.title || 'Untitled'}</span>
              <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); deleteAgentSession(s.id).then(() => { setSessions((x) => x.filter((y) => y.id !== s.id)); if (sessionId === s.id) setSessionId(undefined); }); }}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Single Agent</span>
            {settings.model && (
              <span className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                <Cpu className="h-2.5 w-2.5" />{settings.model}
              </span>
            )}
          </div>
          <button type="button" onClick={openSettings}
            className={cn('flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
              settingsOpen ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent')}
            title="Agent settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {turns.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-7 w-7 text-primary/70" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {settings.model ? 'Send a task to start' : 'Open settings to select a model first'}
                </p>
                {!settings.model && (
                  <Button size="sm" variant="outline" onClick={openSettings} className="gap-2 text-xs">
                    <Settings className="h-3.5 w-3.5" /> Configure agent
                  </Button>
                )}
                {tools.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 max-w-xs mx-auto">
                    {tools.map((t) => (
                      <span key={t.name} className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{t.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-4">
              {/* User bubble */}
              <div className="flex flex-col items-end gap-2">
                <div className="max-w-[80%] rounded-3xl bg-muted px-5 py-3 text-[15px] text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}
                    className="prose prose-neutral dark:prose-invert max-w-none break-words prose-p:my-0 prose-p:leading-snug">
                    {turn.prompt}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Assistant turn */}
              <div className="flex flex-col items-start gap-2">
                {/* Activity pills */}
                {turn.steps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-w-[80%]">
                    {turn.steps.map((step, i) => {
                      if (step.kind === 'thought') {
                        return (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            <Sparkles className="h-2.5 w-2.5" />{step.text.slice(0, 60)}{step.text.length > 60 ? '…' : ''}
                          </span>
                        );
                      }
                      if (step.kind === 'tool_call') {
                        const Icon = TOOL_ICONS[step.name] ?? Terminal;
                        return (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                            <Icon className="h-2.5 w-2.5" />Tool: {step.name}
                          </span>
                        );
                      }
                      return (
                        <span key={i} className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          {step.name} done
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Response bubble */}
                <div className="max-w-[80%] text-[15px] text-foreground">
                  {turn.pending && !turn.response ? (
                    <div className="flex items-center gap-1.5 h-6 text-muted-foreground/70">
                      <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}
                      className="prose prose-neutral dark:prose-invert max-w-none break-words prose-pre:whitespace-pre-wrap prose-pre:break-words"
                      components={{ code: ({ children, className }) => (
                        <code className={cn('rounded bg-black/10 px-1 py-0.5 font-mono text-xs', className)}>{children}</code>
                      )}}>
                      {cleanMarkdown(turn.response || '')}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form onSubmit={onSubmit} className="px-4 pt-3 pb-8 bg-background/95">
          <div className="max-w-4xl mx-auto relative group">
            <div className="chat-composer-glow absolute inset-0 rounded-[28px] overflow-hidden shadow-sm pointer-events-none transition-all duration-300" />
            <div className="relative z-10 flex items-center gap-2 rounded-[28px] bg-card px-3 py-1.5 m-[1px] border border-transparent">
              <button type="button" onClick={openSettings}
                className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Settings">
                <Plus className="h-5 w-5" />
              </button>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={settings.model ? 'Single agent task with tools…' : 'Select a model in Settings first…'}
                className="min-w-0 flex-1 border-0 h-12 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
                disabled={running || !settings.model}
              />
              <Button type="submit"
                disabled={running || !draft.trim() || !settings.model}
                className="h-10 w-10 rounded-full bg-black hover:bg-gray-800 text-white transition-all disabled:opacity-50 shrink-0">
                {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Single Agent Settings</h3>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" /> Model
                </label>
                <select value={draftSettings.model} onChange={(e) => setDraftSettings((s) => ({ ...s, model: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">— Select a model —</option>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Prompt</label>
                <p className="text-xs text-muted-foreground">Override the default ReAct prompt. Leave blank for default.</p>
                <textarea rows={5} value={draftSettings.systemPrompt}
                  onChange={(e) => setDraftSettings((s) => ({ ...s, systemPrompt: e.target.value }))}
                  placeholder="You are an autonomous AI agent…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max Iterations</label>
                <p className="text-xs text-muted-foreground">Reason → Act → Observe cycles (1–20).</p>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={20} step={1} value={draftSettings.maxIterations}
                    onChange={(e) => setDraftSettings((s) => ({ ...s, maxIterations: Number(e.target.value) }))}
                    className="flex-1 accent-primary" />
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">{draftSettings.maxIterations}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available Tools</label>
                <div className="flex flex-wrap gap-1.5">
                  {tools.length === 0 ? <p className="text-xs text-muted-foreground">No tools loaded</p> :
                    tools.map((t) => (
                      <span key={t.name} className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-[11px] font-medium text-primary">{t.name}</span>
                    ))}
                </div>
              </div>
            </div>
            <div className="border-t border-border px-5 py-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={applySettings}>Apply</Button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useServers } from '@/queries/servers';
import { runAgentStream, fetchAgentSessions, deleteAgentSession, fetchAgentTeams, createAgentTeam, fetchAgentSettings, saveAgentSettings } from '@/queries/agent';
import type { AgentProfileInput, AgentSessionDto, AgentStreamEvent, AgentTeamDto } from '@/types/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Users, Loader2, Trash2, Sparkles, Plus, Settings, X, Cpu, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';

type AgentStep =
  | { kind: 'thought'; text: string }
  | { kind: 'handoff'; from: string | null; to: string; reason?: string }
  | { kind: 'agent_message'; agent: string; model?: string; content: string };

type Turn = { id: string; prompt: string; steps: AgentStep[]; response: string; pending: boolean };

const DEFAULT_AGENTS: AgentProfileInput[] = [
  { name: 'Researcher', role: 'Search the web and gather facts. Delegate coding to Coder.', model: '' },
  { name: 'Coder', role: 'Write and run Python code to analyze data.', model: '' },
  { name: 'Synthesizer', role: 'Combine team findings into a clear final answer.', model: '' },
];

function cleanMarkdown(c: string) {
  return c.split(/(```[\s\S]*?```)/g).map((p) =>
    p.startsWith('```') ? p : p.replace(/_{3,}/g, ' ').replace(/-{4,}/g, ' ').replace(/[ \t]{2,}/g, ' ')
  ).join('');
}

interface MultiSettings { defaultModel: string; supervisorPrompt: string; maxRounds: number; teamName: string; agents: AgentProfileInput[]; teamId?: string | null; }
const DEFAULTS: MultiSettings = { defaultModel: '', supervisorPrompt: '', maxRounds: 12, teamName: 'My Team', agents: DEFAULT_AGENTS };
const STORAGE_KEY = 'oneai:multi-agent-settings';

function loadSettings(): MultiSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

function saveSettings(s: MultiSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function normalizeSettings(settings: Partial<MultiSettings>): MultiSettings {
  return {
    ...DEFAULTS,
    ...settings,
    agents: settings.agents && settings.agents.length > 0
      ? settings.agents.map((agent) => ({
          ...agent,
          system_prompt: agent.system_prompt ?? undefined,
        }))
      : DEFAULTS.agents,
  };
}

export default function MultiAgentPage() {
  const { data: servers } = useServers();
  const [sessions, setSessions] = useState<AgentSessionDto[]>([]);
  const [teams, setTeams] = useState<AgentTeamDto[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cfg, setCfg] = useState<MultiSettings>(() => loadSettings());
  const [draft_cfg, setDraftCfg] = useState<MultiSettings>(() => loadSettings());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const models = useMemo(() => servers?.flatMap((s) => s.models?.map((m) => m.name) ?? []) ?? [], [servers]);

  // Only auto-select model if nothing saved yet
  useEffect(() => {
    if (!settingsLoaded) return;
    if (cfg.defaultModel || !models.length) return;
    const first = models[0]!;
    setCfg((s) => ({ ...s, defaultModel: first, agents: s.agents.map((a) => (a.model ? a : { ...a, model: first })) }));
    setDraftCfg((s) => ({ ...s, defaultModel: first, agents: s.agents.map((a) => (a.model ? a : { ...a, model: first })) }));
  }, [models, cfg.defaultModel, settingsLoaded]);

  useEffect(() => {
    fetchAgentSessions().then(setSessions).catch(() => {});
    fetchAgentTeams().then(setTeams).catch(() => {});
    fetchAgentSettings()
      .then((saved) => {
        const next = normalizeSettings(saved.multi);
        setCfg(next);
        setDraftCfg(next);
        saveSettings(next);
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns]);

  function openSettings() { setDraftCfg(cfg); setSettingsOpen(true); }
  async function applySettings() {
    if (!draft_cfg.defaultModel) { toast.error('Please select a default model'); return; }
    saveSettings(draft_cfg);
    setCfg(draft_cfg);
    try {
      const current = await fetchAgentSettings().catch(() => null);
      await saveAgentSettings({
        single: current?.single ?? {
          model: '',
          systemPrompt: '',
          maxIterations: 10,
        },
        multi: draft_cfg,
      });
    } catch {
      toast.error('Saved locally, but failed to sync settings');
      return;
    }
    setSettingsOpen(false); toast.success('Settings applied');
  }

  function updateDraftAgent(idx: number, patch: Partial<AgentProfileInput>) {
    setDraftCfg((s) => ({ ...s, teamId: undefined, agents: s.agents.map((a, i) => i === idx ? { ...a, ...patch } : a) }));
  }

  async function saveTeam() {
    const profiles = draft_cfg.agents.filter((a) => a.name.trim() && a.model);
    if (profiles.length < 2) { toast.error('Need at least 2 agents'); return; }
    try {
      const team = await createAgentTeam({ name: draft_cfg.teamName, profiles });
      setTeams((t) => [team, ...t]);
      setDraftCfg((s) => ({ ...s, teamId: team.id }));
      toast.success('Team saved');
    } catch { toast.error('Failed to save team'); }
  }

  function loadTeam(team: AgentTeamDto) {
    setDraftCfg((s) => ({
      ...s, teamId: team.id, teamName: team.name,
      agents: team.profiles.map((p) => ({ name: p.name, role: p.role, model: p.model, system_prompt: p.systemPrompt ?? undefined })),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt || running) return;
    const validAgents = cfg.agents.filter((a) => a.name && a.model);
    if (!cfg.teamId && validAgents.length < 2) { toast.error('Configure at least 2 agents in Settings'); return; }

    const turnId = crypto.randomUUID();
    setDraft('');
    setTurns((t) => [...t, { id: turnId, prompt, steps: [], response: '', pending: true }]);
    setRunning(true);
    abortRef.current = new AbortController();

    const handleEvent = (evt: AgentStreamEvent) => {
      setTurns((prev) => prev.map((t) => {
        if (t.id !== turnId) return t;
        switch (evt.type) {
          case 'thought': return { ...t, steps: [...t.steps, { kind: 'thought', text: evt.content }] };
          case 'handoff': return { ...t, steps: [...t.steps, { kind: 'handoff', from: evt.from, to: evt.to, reason: evt.reason }] };
          case 'agent_message': return { ...t, steps: [...t.steps, { kind: 'agent_message', agent: evt.agent, model: evt.model, content: evt.content }] };
          case 'response': return { ...t, response: evt.content };
          case 'done': if (evt.sessionId) setSessionId(evt.sessionId); return { ...t, pending: false };
          default: return t;
        }
      }));
      if (evt.type === 'error') toast.error(evt.content);
    };

    try {
      await runAgentStream(
        { prompt, mode: 'multi', session_id: sessionId, team_id: cfg.teamId ?? undefined,
          agents: cfg.teamId ? undefined : validAgents,
          system_prompt: cfg.supervisorPrompt || undefined, max_iterations: cfg.maxRounds },
        handleEvent, abortRef.current.signal,
      );
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Agent run failed');
      setTurns((prev) => prev.map((t) => t.id === turnId ? { ...t, pending: false } : t));
    } finally { setRunning(false); abortRef.current = null; fetchAgentSessions().then(setSessions).catch(() => {}); }
  }

  // Agent name → colour mapping (stable per name)
  const agentColors = useMemo(() => {
    const palette = ['text-blue-600 bg-blue-500/10', 'text-violet-600 bg-violet-500/10', 'text-emerald-600 bg-emerald-500/10', 'text-rose-600 bg-rose-500/10', 'text-amber-600 bg-amber-500/10'];
    const map: Record<string, string> = {};
    cfg.agents.forEach((a, i) => { map[a.name] = palette[i % palette.length]!; });
    return map;
  }, [cfg.agents]);

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* Sessions sidebar */}
      <div className="hidden w-52 shrink-0 flex-col border-r border-border/40 bg-card/20 p-3 lg:flex">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sessions</p>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setSessionId(undefined); setTurns([]); }}>New</Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.id}
              className={cn('group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors',
                sessionId === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground')}
              onClick={() => setSessionId(s.id)}>
              <Users className="h-3 w-3 shrink-0" />
              <span className="flex-1 truncate">{s.title || 'Untitled'}</span>
              <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(ev) => { ev.stopPropagation(); deleteAgentSession(s.id).then(() => { setSessions((x) => x.filter((y) => y.id !== s.id)); if (sessionId === s.id) setSessionId(undefined); }); }}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Multi-Agent Team</span>
            {cfg.defaultModel && (
              <span className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                <Cpu className="h-2.5 w-2.5" />{cfg.defaultModel}
              </span>
            )}
            <span className="rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
              {cfg.agents.filter(a => a.name && a.model).length} agents
            </span>
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
                  <Users className="h-7 w-7 text-primary/70" />
                </div>
                <p className="text-sm font-medium">Multi-Agent Team</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {cfg.defaultModel
                    ? `${cfg.agents.filter(a => a.name && a.model).length} agents ready. Send a task and your team will collaborate.`
                    : 'Open Settings to configure your model and team.'}
                </p>
                {!cfg.defaultModel && (
                  <Button size="sm" variant="outline" onClick={openSettings} className="gap-2 text-xs">
                    <Settings className="h-3.5 w-3.5" /> Configure team
                  </Button>
                )}
                {cfg.defaultModel && (
                  <div className="flex flex-wrap justify-center gap-1.5 max-w-xs mx-auto">
                    {cfg.agents.filter(a => a.name).map((a, i) => (
                      <span key={i} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', agentColors[a.name] || 'bg-muted text-muted-foreground')}>
                        {a.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-4">
              {/* User bubble */}
              <div className="flex flex-col items-end">
                <div className="max-w-[80%] rounded-3xl bg-muted px-5 py-3 text-[15px] text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-neutral dark:prose-invert max-w-none break-words prose-p:my-0 prose-p:leading-snug">
                    {turn.prompt}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Agent activity */}
              <div className="flex flex-col items-start gap-2.5">
                {/* Thought pills */}
                {turn.steps.filter(s => s.kind === 'thought').length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {turn.steps.filter(s => s.kind === 'thought').map((step, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        <Sparkles className="h-2.5 w-2.5" />{(step as any).text.slice(0, 60)}…
                      </span>
                    ))}
                  </div>
                )}

                {/* Handoffs + agent messages interleaved */}
                {turn.steps.filter(s => s.kind === 'handoff' || s.kind === 'agent_message').map((step, i) => {
                  if (step.kind === 'handoff') return (
                    <div key={i} className="flex w-full max-w-[80%] items-center gap-2 text-[10px] text-muted-foreground">
                      <div className="h-px flex-1 bg-border/50" />
                      <span className="rounded-full border border-border/50 bg-background px-2 py-0.5 whitespace-nowrap">
                        {step.from ?? 'Start'} → {step.to}
                      </span>
                      <div className="h-px flex-1 bg-border/50" />
                    </div>
                  );
                  if (step.kind === 'agent_message') {
                    const color = agentColors[step.agent] ?? 'bg-muted/60 text-foreground';
                    return (
                      <div key={i} className="max-w-[80%] rounded-2xl rounded-tl-[4px] border border-border/40 bg-card/60 px-4 py-2.5">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', color)}>{step.agent}</span>
                          {step.model && <span className="text-[10px] text-muted-foreground">{step.model}</span>}
                        </div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words prose-pre:whitespace-pre-wrap prose-pre:break-words">
                          {step.content}
                        </ReactMarkdown>
                      </div>
                    );
                  }
                  return null;
                })}

                {/* Final synthesized response */}
                {(turn.response || (turn.pending && !turn.steps.some(s => s.kind === 'agent_message'))) && (
                  <div className="max-w-[80%] text-[15px] text-foreground">
                    {turn.pending && !turn.response ? (
                      <div className="flex items-center gap-1.5 h-6 text-muted-foreground/70">
                        <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : turn.response ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}
                        className="prose prose-neutral dark:prose-invert max-w-none break-words prose-pre:whitespace-pre-wrap prose-pre:break-words"
                        components={{ code: ({ children, className }) => <code className={cn('rounded bg-black/10 px-1 py-0.5 font-mono text-xs', className)}>{children}</code> }}>
                        {cleanMarkdown(turn.response)}
                      </ReactMarkdown>
                    ) : null}
                  </div>
                )}
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
                className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <Plus className="h-5 w-5" />
              </button>
              <Input value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder={cfg.defaultModel ? 'Multi-agent task: your team will collaborate…' : 'Configure your team in Settings first…'}
                className="min-w-0 flex-1 border-0 h-12 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
                disabled={running} />
              {running ? (
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 px-3 text-xs rounded-full" onClick={() => abortRef.current?.abort()}>Stop</Button>
              ) : (
                <Button type="submit" disabled={!draft.trim()}
                  className="h-10 w-10 rounded-full bg-black hover:bg-gray-800 text-white transition-all disabled:opacity-50 shrink-0">
                  {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                </Button>
              )}
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
                <h3 className="font-semibold text-sm">Multi-Agent Settings</h3>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Default Model */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" /> Default Model</label>
                <p className="text-xs text-muted-foreground">Supervisor model and default for new agents.</p>
                <select value={draft_cfg.defaultModel} onChange={(e) => setDraftCfg((s) => ({ ...s, defaultModel: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">— Select a model —</option>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Team */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Agent Team</label>
                <div className="flex gap-2">
                  <Input value={draft_cfg.teamName} onChange={(e) => setDraftCfg((s) => ({ ...s, teamName: e.target.value }))} className="h-8 text-xs flex-1" placeholder="Team name" />
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={saveTeam}>Save</Button>
                </div>
                {teams.length > 0 && (
                  <select className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={draft_cfg.teamId || ''}
                    onChange={(e) => { const t = teams.find((x) => x.id === e.target.value); if (t) loadTeam(t); }}>
                    <option value="">Load saved team…</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <div className="space-y-2">
                  {draft_cfg.agents.map((agent, idx) => (
                    <div key={idx} className="rounded-lg border border-border/40 bg-background/50 p-2 space-y-1.5">
                      <div className="flex gap-1.5">
                        <Input value={agent.name} onChange={(e) => updateDraftAgent(idx, { name: e.target.value })} placeholder="Name" className="h-7 text-xs flex-1" />
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setDraftCfg((s) => ({ ...s, agents: s.agents.filter((_, i) => i !== idx) }))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input value={agent.role} onChange={(e) => updateDraftAgent(idx, { role: e.target.value })} placeholder="Role / expertise" className="h-7 text-xs" />
                      <select value={agent.model} onChange={(e) => updateDraftAgent(idx, { model: e.target.value })}
                        className="w-full h-7 rounded-md border border-input bg-transparent px-2 text-xs">
                        {models.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs w-full"
                    onClick={() => setDraftCfg((s) => ({ ...s, agents: [...s.agents, { name: `Agent ${s.agents.length + 1}`, role: '', model: s.defaultModel || '' }] }))}>
                    <Plus className="h-3 w-3 mr-1" /> Add agent
                  </Button>
                </div>
              </div>

              {/* Supervisor prompt */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supervisor Prompt</label>
                <p className="text-xs text-muted-foreground">Override the supervisor coordination instructions. Leave blank for default.</p>
                <textarea rows={4} value={draft_cfg.supervisorPrompt} onChange={(e) => setDraftCfg((s) => ({ ...s, supervisorPrompt: e.target.value }))}
                  placeholder="You are the supervisor…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>

              {/* Max rounds */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max Agent Rounds</label>
                <p className="text-xs text-muted-foreground">Supervisor → agent turns (1–20).</p>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={20} step={1} value={draft_cfg.maxRounds}
                    onChange={(e) => setDraftCfg((s) => ({ ...s, maxRounds: Number(e.target.value) }))}
                    className="flex-1 accent-primary" />
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">{draft_cfg.maxRounds}</span>
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

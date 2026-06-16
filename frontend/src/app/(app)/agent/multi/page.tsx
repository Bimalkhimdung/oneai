'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useServers } from '@/queries/servers';
import {
  runAgentStream,
  fetchAgentSessions,
  deleteAgentSession,
  fetchAgentTeams,
  createAgentTeam,
} from '@/queries/agent';
import type {
  AgentProfileInput,
  AgentSessionDto,
  AgentStreamEvent,
  AgentTeamDto,
} from '@/types/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Users,
  Loader2,
  Send,
  ChevronDown,
  ChevronRight,
  Trash2,
  Terminal,
  Sparkles,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

type StepItem =
  | { kind: 'thought'; content: string }
  | { kind: 'agent_message'; agent: string; content: string; model?: string }
  | { kind: 'handoff'; from: string | null; to: string; reason?: string };

const DEFAULT_TEAM_AGENTS: AgentProfileInput[] = [
  {
    name: 'Researcher',
    role: 'Search the web and gather facts. Delegate coding to Coder.',
    model: '',
  },
  {
    name: 'Coder',
    role: 'Write and run Python code to analyze data.',
    model: '',
  },
  {
    name: 'Synthesizer',
    role: 'Combine team findings into a clear final answer.',
    model: '',
  },
];

export default function MultiAgentPage() {
  const { data: servers } = useServers();
  const [sessions, setSessions] = useState<AgentSessionDto[]>([]);
  const [teams, setTeams] = useState<AgentTeamDto[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [teamId, setTeamId] = useState<string | undefined>();
  const [teamName, setTeamName] = useState('My Agent Team');
  const [draftAgents, setDraftAgents] = useState<AgentProfileInput[]>(DEFAULT_TEAM_AGENTS);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [cotOpen, setCotOpen] = useState(true);
  const [configOpen, setConfigOpen] = useState(true);
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [response, setResponse] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const models = useMemo(
    () => servers?.flatMap((s) => s.models?.map((m) => m.name) ?? []) ?? [],
    [servers],
  );

  useEffect(() => {
    if (models.length === 0) return;
    setDraftAgents((prev) =>
      prev.map((a) => (a.model ? a : { ...a, model: models[0]! })),
    );
  }, [models]);

  useEffect(() => {
    fetchAgentSessions().then(setSessions).catch(() => {});
    fetchAgentTeams().then(setTeams).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, response, running]);

  const handleEvent = (evt: AgentStreamEvent) => {
    switch (evt.type) {
      case 'thought':
        setSteps((s) => [...s, { kind: 'thought', content: evt.content }]);
        break;
      case 'agent_message':
        setSteps((s) => [
          ...s,
          { kind: 'agent_message', agent: evt.agent, content: evt.content, model: evt.model },
        ]);
        break;
      case 'handoff':
        setSteps((s) => [
          ...s,
          { kind: 'handoff', from: evt.from, to: evt.to, reason: evt.reason },
        ]);
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
    if (!prompt.trim() || running) return;
    if (!teamId && draftAgents.filter((a) => a.name && a.model).length < 2) {
      toast.error('Configure at least 2 agents or save a team');
      return;
    }

    setRunning(true);
    setSteps([]);
    setResponse('');
    abortRef.current = new AbortController();

    try {
      await runAgentStream(
        {
          prompt: prompt.trim(),
          mode: 'multi',
          session_id: sessionId,
          team_id: teamId,
          agents: teamId ? undefined : draftAgents.filter((a) => a.name && a.model),
        },
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

  async function onSaveTeam() {
    const profiles = draftAgents.filter((a) => a.name.trim() && a.model);
    if (profiles.length < 2) {
      toast.error('Need at least 2 agents with name and model');
      return;
    }
    try {
      const team = await createAgentTeam({ name: teamName, profiles });
      setTeams((t) => [team, ...t]);
      setTeamId(team.id);
      toast.success('Team saved');
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || 'Failed to save team');
    }
  }

  function loadTeam(team: AgentTeamDto) {
    setTeamId(team.id);
    setTeamName(team.name);
    setDraftAgents(
      team.profiles.map((p) => ({
        name: p.name,
        role: p.role,
        model: p.model,
        system_prompt: p.systemPrompt,
      })),
    );
  }

  function updateAgent(idx: number, patch: Partial<AgentProfileInput>) {
    setDraftAgents((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
    setTeamId(undefined);
  }

  function addAgent() {
    setDraftAgents((prev) => [
      ...prev,
      { name: `Agent ${prev.length + 1}`, role: '', model: models[0] || '' },
    ]);
  }

  function removeAgent(idx: number) {
    setDraftAgents((prev) => prev.filter((_, i) => i !== idx));
    setTeamId(undefined);
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
                onClick={(ev) => {
                  ev.stopPropagation();
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
        <div className="mb-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Multi-Agent Team
          </h2>
          <p className="text-sm text-muted-foreground">
            Supervisor coordinates specialized agents — they collaborate to complete complex tasks.
          </p>
        </div>

        {/* Team configuration */}
        <div className="mb-3 rounded-lg border border-border/60 bg-card/40">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground"
            onClick={() => setConfigOpen(!configOpen)}
          >
            {configOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Users className="h-3.5 w-3.5" />
            Team configuration
          </button>
          {configOpen && (
            <div className="border-t border-border/40 px-3 py-3 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="h-8 text-xs max-w-[200px]"
                  placeholder="Team name"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onSaveTeam}>
                  Save team
                </Button>
                {teams.length > 0 && (
                  <select
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={teamId || ''}
                    onChange={(e) => {
                      const t = teams.find((x) => x.id === e.target.value);
                      if (t) loadTeam(t);
                    }}
                  >
                    <option value="">Load saved team…</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {draftAgents.map((agent, idx) => (
                <div key={idx} className="grid gap-2 rounded-md border border-border/40 p-2 sm:grid-cols-12">
                  <Input
                    value={agent.name}
                    onChange={(e) => updateAgent(idx, { name: e.target.value })}
                    placeholder="Name"
                    className="h-8 text-xs sm:col-span-2"
                  />
                  <Input
                    value={agent.role}
                    onChange={(e) => updateAgent(idx, { role: e.target.value })}
                    placeholder="Role / expertise"
                    className="h-8 text-xs sm:col-span-4"
                  />
                  <select
                    value={agent.model}
                    onChange={(e) => updateAgent(idx, { model: e.target.value })}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs sm:col-span-3"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <div className="flex gap-1 sm:col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeAgent(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="text-xs h-8" onClick={addAgent}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add agent
              </Button>
            </div>
          )}
        </div>

        {/* Agent activity */}
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
                  if (step.kind === 'handoff') {
                    return (
                      <p key={i} className="text-xs text-violet-600 dark:text-violet-400">
                        Handoff: {step.from ?? 'start'} → {step.to}
                        {step.reason ? ` — ${step.reason}` : ''}
                      </p>
                    );
                  }
                  if (step.kind === 'agent_message') {
                    return (
                      <div key={i} className="rounded-md border border-border/40 bg-muted/20 p-2">
                        <span className="text-[10px] font-bold text-primary">{step.agent}</span>
                        {step.model && (
                          <span className="ml-2 text-[10px] text-muted-foreground">{step.model}</span>
                        )}
                        <p className="text-xs mt-1 whitespace-pre-wrap break-words">{step.content}</p>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Response */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-border/60 bg-card/30 p-4 mb-3">
          {response ? (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-pre:whitespace-pre-wrap prose-pre:break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {running ? 'Agents are collaborating…' : 'Configure your team and send a task.'}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Multi-agent task: agents will discuss and collaborate…"
            className="flex-1"
            disabled={running}
          />
          {running ? (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!prompt.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

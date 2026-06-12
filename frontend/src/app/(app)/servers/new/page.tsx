'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateServer, useTestServer } from '@/queries/servers';
import { ApiClientError } from '@/lib/api';

const PROVIDERS = [
  { value: 'OLLAMA', label: 'Ollama' },
  { value: 'LM_STUDIO', label: 'LM Studio (coming soon)' },
  { value: 'VLLM', label: 'vLLM (coming soon)' },
  { value: 'OPENAI_COMPAT', label: 'OpenAI-compatible (coming soon)' },
  { value: 'LOCALAI', label: 'LocalAI (coming soon)' },
];

export default function NewServerPage() {
  const router = useRouter();
  const create = useCreateServer();
  const test = useTestServer();

  const [form, setForm] = useState({
    name: '',
    host: 'localhost',
    port: 11434,
    provider: 'OLLAMA' as const,
    apiKey: '',
  });

  const update =
    <K extends keyof typeof form>(key: K) =>
    (value: (typeof form)[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  async function onTest() {
    try {
      const res = await test.mutateAsync({
        host: form.host,
        port: Number(form.port),
        provider: form.provider,
        apiKey: form.apiKey || undefined,
      });
      if (res.ok) toast.success(`Connected — Ollama v${res.version ?? 'unknown'}`);
      else toast.error(res.error ?? 'Could not connect');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
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
      toast.success('Server added');
      router.push('/servers');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.payload.message : 'Could not save server';
      toast.error(msg);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Add an AI Server</CardTitle>
          <CardDescription>
            Connect to a local model source. Ollama is supported today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Display name</label>
              <Input
                required
                placeholder="My home Ollama"
                value={form.name}
                onChange={(e) => update('name')(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Source</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.provider}
                onChange={(e) => update('provider')(e.target.value as typeof form.provider)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value} disabled={p.value !== 'OLLAMA'}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Host</label>
                <Input
                  required
                  value={form.host}
                  onChange={(e) => update('host')(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Port</label>
                <Input
                  required
                  type="number"
                  value={form.port}
                  onChange={(e) => update('port')(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">API key (optional)</label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => update('apiKey')(e.target.value)}
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onTest}
                disabled={test.isPending}
              >
                {test.isPending ? 'Testing…' : 'Test connection'}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'Save server'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

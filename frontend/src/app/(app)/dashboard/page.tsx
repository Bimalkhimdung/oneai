'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Server, Database, MessageSquare, Cpu, ArrowUpRight, HardDrive, MemoryStick, Gauge } from 'lucide-react';
import Link from 'next/link';

interface SystemSpecs {
  cpu: {
    brand: string;
    physicalCores: number;
    logicalCores: number;
    percent: number;
  };
  ram: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    percent: number;
  };
  storage: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    percent: number;
  };
  gpu: {
    name: string;
    utilizationPercent?: number | null;
    memoryTotalGb?: number | null;
    memoryUsedGb?: number | null;
    memoryPercent?: number | null;
  }[];
}

const utilizationTone = (value: number) => {
  if (value >= 85) return 'bg-red-500';
  if (value >= 65) return 'bg-amber-500';
  return 'bg-emerald-500';
};

const utilizationLabel = (value: number) => {
  if (value >= 85) return 'High load';
  if (value >= 65) return 'Moderate';
  return 'Healthy';
};

function UtilizationRow({
  icon: Icon,
  label,
  detail,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  detail: string;
  value: number;
}) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className="rounded-[4px] border border-border/50 bg-background/35 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-[4px] border border-border/60 bg-card flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground truncate">{detail}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-lg font-semibold leading-none">{normalized.toFixed(1)}%</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{utilizationLabel(normalized)}</p>
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`${utilizationTone(normalized)} h-full rounded-full transition-all duration-700`}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

function GpuRow({
  gpu,
}: {
  gpu: SystemSpecs['gpu'][number];
}) {
  const hasUtilization = typeof gpu.utilizationPercent === 'number';
  const hasMemory = typeof gpu.memoryPercent === 'number';
  const value = hasUtilization ? gpu.utilizationPercent! : (hasMemory ? gpu.memoryPercent! : null);
  const detail = hasMemory && gpu.memoryUsedGb != null && gpu.memoryTotalGb != null
    ? `${gpu.memoryUsedGb}GB VRAM used of ${gpu.memoryTotalGb}GB`
    : 'GPU detected, utilization data unavailable';

  if (value == null) {
    return (
      <div className="rounded-[4px] border border-border/50 bg-background/35 p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-[4px] border border-border/60 bg-card flex items-center justify-center shrink-0">
            <Cpu className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{gpu.name}</p>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <UtilizationRow
      icon={Cpu}
      label={gpu.name}
      detail={detail}
      value={value}
    />
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    servers: 0,
    models: 0,
    chats: 0,
    loading: true
  });
  const [systemSpecs, setSystemSpecs] = useState<SystemSpecs | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [serversRes, installsRes, chatsRes] = await Promise.all([
          api('/servers').catch(() => []),
          api('/settings/installations').catch(() => ({})),
          api('/chats').catch(() => [])
        ]);

        const installedCount = Object.values(installsRes || {}).filter((i: any) => i.status === 'installed' || i.status === 'completed').length;

        setStats({
          servers: Array.isArray(serversRes) ? serversRes.length : 0,
          models: installedCount,
          chats: Array.isArray(chatsRes) ? chatsRes.length : 0,
          loading: false
        });
      } catch (err) {
        setStats(s => ({ ...s, loading: false }));
      }
    }
    loadStats();
  }, []);

  useEffect(() => {
    async function loadSystemSpecs() {
      try {
        const data = await api<SystemSpecs>('/settings/system-specs');
        setSystemSpecs(data);
      } catch (err) {
        console.error('Failed to load system specs', err);
      } finally {
        setSystemLoading(false);
      }
    }

    loadSystemSpecs();
    const interval = setInterval(loadSystemSpecs, 30000);
    return () => clearInterval(interval);
  }, []);

  const averageUtilization = systemSpecs
    ? (systemSpecs.cpu.percent + systemSpecs.ram.percent + systemSpecs.storage.percent) / 3
    : 0;
  const gpuList = systemSpecs?.gpu ?? [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Servers Card */}
        <Link href="/servers">
          <Card className="rounded-[4px] bg-card/80 backdrop-blur-md border border-border/80 shadow-sm hover:shadow-md hover:border-primary/60 transition-all duration-300 group overflow-hidden relative h-full cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Servers</CardTitle>
              <Server className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">
                {stats.loading ? <span className="animate-pulse text-muted">...</span> : stats.servers}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <span className="text-emerald-500 flex items-center group-hover:translate-x-1 transition-transform"><ArrowUpRight className="w-3 h-3 mr-0.5" /> Connect more</span>
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Models Card */}
        <Link href="/settings/ollama/models">
          <Card className="rounded-[4px] bg-card/80 backdrop-blur-md border border-border/80 shadow-sm hover:shadow-md hover:border-blue-500/60 transition-all duration-300 group overflow-hidden relative h-full cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Installed Models</CardTitle>
              <Cpu className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">
                {stats.loading ? <span className="animate-pulse text-muted">...</span> : stats.models}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <span className="text-blue-500 flex items-center group-hover:translate-x-1 transition-transform"><ArrowUpRight className="w-3 h-3 mr-0.5" /> Browse library</span>
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Chats Card */}
        <Link href="/chat">
          <Card className="rounded-[4px] bg-card/80 backdrop-blur-md border border-border/80 shadow-sm hover:shadow-md hover:border-purple-500/60 transition-all duration-300 group overflow-hidden relative h-full cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">
                {stats.loading ? <span className="animate-pulse text-muted">...</span> : stats.chats}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <span className="text-purple-500 flex items-center group-hover:translate-x-1 transition-transform"><ArrowUpRight className="w-3 h-3 mr-0.5" /> View history</span>
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Additional layout section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 rounded-[4px] bg-card/80 border border-border/80 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">System Utilization</CardTitle>
              <CardDescription>
                Live host resource usage for local model workloads.
              </CardDescription>
            </div>
            <div className="h-10 w-10 rounded-[4px] border border-primary/20 bg-primary/10 flex items-center justify-center shrink-0">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="border-t border-border/40 bg-neutral-950/20 p-5">
            {systemLoading && !systemSpecs ? (
              <div className="h-[278px] flex items-center justify-center text-sm text-muted-foreground">
                Loading telemetry...
              </div>
            ) : systemSpecs ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[4px] border border-border/50 bg-background/35 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Overall</p>
                    <p className="mt-1 text-2xl font-semibold font-mono">{averageUtilization.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-[4px] border border-border/50 bg-background/35 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">CPU Cores</p>
                    <p className="mt-1 text-2xl font-semibold font-mono">{systemSpecs.cpu.logicalCores}</p>
                  </div>
                  <div className="rounded-[4px] border border-border/50 bg-background/35 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">GPU</p>
                    <p className="mt-1 text-2xl font-semibold font-mono">
                      {gpuList.length > 0 ? gpuList.length : 'None'}
                    </p>
                  </div>
                </div>

                <UtilizationRow
                  icon={Cpu}
                  label="CPU"
                  detail={`${systemSpecs.cpu.physicalCores} physical cores, ${systemSpecs.cpu.logicalCores} threads`}
                  value={systemSpecs.cpu.percent}
                />
                <UtilizationRow
                  icon={MemoryStick}
                  label="Memory"
                  detail={`${systemSpecs.ram.usedGb}GB used of ${systemSpecs.ram.totalGb}GB`}
                  value={systemSpecs.ram.percent}
                />
                <UtilizationRow
                  icon={HardDrive}
                  label="Storage"
                  detail={`${systemSpecs.storage.freeGb}GB free of ${systemSpecs.storage.totalGb}GB`}
                  value={systemSpecs.storage.percent}
                />
                {gpuList.length > 0 ? (
                  gpuList.map((gpu, index) => (
                    <GpuRow key={`${gpu.name}-${index}`} gpu={gpu} />
                  ))
                ) : (
                  <div className="rounded-[4px] border border-dashed border-border/60 bg-background/25 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-[4px] border border-border/60 bg-card flex items-center justify-center shrink-0">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">No GPU installed</p>
                        <p className="text-xs text-muted-foreground">CPU inference is available for local models.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[278px] flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Gauge className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground font-mono">Telemetry unavailable</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3 rounded-[4px] bg-card/80 border border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>
              Your latest interactions and updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">System Initialized</p>
                <p className="text-xs text-muted-foreground">Welcome back to your local environment.</p>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap font-mono">Just now</div>
            </div>

            {stats.models > 0 && (
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">{stats.models} Models Installed</p>
                  <p className="text-xs text-muted-foreground">Ready for local inference tasks.</p>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap font-mono">Recent</div>
              </div>
            )}

            <div className="flex items-center gap-4 opacity-50">
              <div className="w-9 h-9 rounded-full border border-dashed border-border flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-muted-foreground">Awaiting first prompt...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

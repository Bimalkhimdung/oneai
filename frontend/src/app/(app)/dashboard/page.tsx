'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Server, Database, MessageSquare, Activity, Cpu, ArrowUpRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    servers: 0,
    models: 0,
    chats: 0,
    loading: true
  });

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-[1px] bg-gradient-to-br from-primary/10 via-card to-background border border-border/40 p-8 shadow-lg">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
          <Sparkles className="w-64 h-64 text-primary" />
        </div>
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 mb-2">
            <Activity className="w-3.5 h-3.5" />
            System Online
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Command Center
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Welcome to your local AI hub. Monitor your inference engines, manage model weights, and dive back into your recent conversations.
          </p>
          <div className="pt-4 flex gap-4">
            <Link href="/settings/ollama/models" className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-6 py-2 rounded-[1px] gap-2">
              <Database className="w-4 h-4" />
              Download Models
            </Link>
            <Link href="/chat" className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-10 px-6 py-2 rounded-[1px] gap-2">
              <MessageSquare className="w-4 h-4" />
              New Chat
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Servers Card */}
        <Link href="/servers">
          <Card className="rounded-[1px] bg-card/40 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-300 group overflow-hidden relative h-full cursor-pointer">
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
          <Card className="rounded-[1px] bg-card/40 backdrop-blur-sm border-border/50 hover:border-blue-500/50 transition-all duration-300 group overflow-hidden relative h-full cursor-pointer">
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
          <Card className="rounded-[1px] bg-card/40 backdrop-blur-sm border-border/50 hover:border-purple-500/50 transition-all duration-300 group overflow-hidden relative h-full cursor-pointer">
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
        <Card className="col-span-4 rounded-[1px] bg-card/30 border-border/50 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">System Utilization</CardTitle>
            <CardDescription>
              Real-time resource metrics will be displayed here.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center border-t border-border/40 bg-neutral-950/20">
            <div className="text-center space-y-3">
              <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground font-mono">Telemetry module offline</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 rounded-[1px] bg-card/30 border-border/50">
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

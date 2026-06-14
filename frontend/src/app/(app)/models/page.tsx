'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Boxes, Plus, Database, CheckCircle2, Server, TerminalSquare } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface ProviderInstallInfo {
  status: 'idle' | 'installing' | 'completed' | 'installed' | 'failed';
  logs: string[];
  progress: number;
}

interface InstallationsResponse {
  [key: string]: ProviderInstallInfo;
}

export default function ModelsPage() {
  const [installedModels, setInstalledModels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadModels() {
      try {
        const installsRes = await api<InstallationsResponse>('/settings/installations');
        
        const models = Object.entries(installsRes || {})
          .filter(([key, info]) => key.startsWith('OLLAMA_MODEL_') && (info.status === 'installed' || info.status === 'completed'))
          .map(([key]) => {
            const id = key.replace('OLLAMA_MODEL_', '');
            return {
              id,
              name: id
            };
          });
          
        setInstalledModels(models);
      } catch (err) {
        toast.error('Failed to load installed models');
      } finally {
        setLoading(false);
      }
    }
    
    loadModels();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl pb-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Boxes className="h-8 w-8 text-primary" />
            My Models
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your locally installed AI models ready for inference.
          </p>
        </div>
        
        <Link href="/settings/ollama/models">
          <Button className="gap-2 shadow-sm h-10 px-6 rounded-[4px]">
            <Plus className="h-4 w-4" />
            Add More Models
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-[4px] bg-card/80 border border-border/80 shadow-sm animate-pulse h-32" />
          ))
        ) : installedModels.length > 0 ? (
          installedModels.map((model) => (
            <Card key={model.id} className="rounded-[4px] bg-card/80 backdrop-blur-md border border-border/80 shadow-sm hover:shadow-md transition-all duration-300 group overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardContent className="p-5 flex flex-col h-full justify-between gap-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 text-primary bg-primary/10 px-2.5 py-1 rounded-md text-xs font-medium border border-primary/20">
                    <TerminalSquare className="w-3.5 h-3.5" />
                    Ollama
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500/80" />
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg text-foreground truncate" title={model.name}>
                    {model.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Server className="w-3.5 h-3.5" />
                    <span>Local runtime</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full">
            <div className="flex flex-col items-center justify-center p-16 text-muted-foreground bg-card/40 rounded-[4px] border border-dashed border-border/80">
              <Database className="h-12 w-12 mb-4 opacity-20 text-primary" />
              <p className="text-lg font-medium text-foreground">No models installed yet</p>
              <p className="text-sm opacity-80 mt-1 mb-6 text-center max-w-md">
                You haven't downloaded any local models. Head over to the model library to discover and install new LLMs.
              </p>
              <Link href="/settings/ollama/models">
                <Button variant="outline" className="gap-2 rounded-[4px]">
                  <Boxes className="w-4 h-4" />
                  Browse Library
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

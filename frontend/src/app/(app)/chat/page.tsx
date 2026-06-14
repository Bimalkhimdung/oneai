'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useCreateChat } from '@/queries/chats';
import { useServers } from '@/queries/servers';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send, Loader2, Plus, Mic, FileText, Globe, Plug, X } from 'lucide-react';
import { toast } from 'sonner';
import { MissingModelAlert } from '@/components/chat/MissingModelAlert';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useMcpServers } from '@/queries/mcp';
import { cn } from '@/lib/utils';

export default function ChatIndexPage() {
  useSocket();
  const router = useRouter();
  const { data: servers } = useServers();
  const { data: mcpServers } = useMcpServers();
  const createChat = useCreateChat();

  const [draft, setDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showMissingModel, setShowMissingModel] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSpeechResult = (text: string) => {
    setDraft(prev => prev + text);
  };
  const { isListening, toggleListening, supported: speechSupported } = useSpeechRecognition(handleSpeechResult);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableModels = servers?.flatMap((s) => s.models || []) || [];
  const enabledMcpCount = mcpServers?.filter((s) => s.enabled).length ?? 0;

  const toggleMcp = () => {
    if (!mcpEnabled && enabledMcpCount === 0) {
      toast.error('Add an MCP server in Settings first', {
        action: { label: 'Settings', onClick: () => router.push('/settings/mcp') },
      });
      return;
    }
    setMcpEnabled(!mcpEnabled);
    setMenuOpen(false);
  };

  if (!selectedModel && availableModels.length > 0) {
    setSelectedModel(availableModels[0]?.id ?? '');
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("File is too large (max 25MB)");
      e.target.value = '';
      return;
    }
    
    if (!selectedModel) {
      toast.error("Please select a model first.");
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const chat = await createChat.mutateAsync({
        modelId: selectedModel,
        title: `Document: ${file.name}`
      });
      
      const formData = new FormData();
      formData.append('file', file);
      await api(`/chats/${chat.id}/documents`, {
        method: 'POST',
        body: formData,
      });
      
      router.push(`/chat/${chat.id}`);
    } catch (err: any) {
      if (err instanceof ApiClientError && err.status === 422) {
        setShowMissingModel(true);
      } else {
        toast.error(err?.message || "Failed to read file.");
      }
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selectedModel) return;
    
    setIsStarting(true);
    try {
      const generatedTitle = draft.split(' ').slice(0, 6).join(' ') + (draft.split(' ').length > 6 ? '...' : '');
      const chat = await createChat.mutateAsync({
        modelId: selectedModel,
        title: generatedTitle || "New chat"
      });
      
      await api(`/chats/${chat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: draft, web_search: webSearchEnabled, mcp_enabled: mcpEnabled })
      });

      router.push(`/chat/${chat.id}`);
    } catch (err) {
      console.error("Failed to start conversation:", err);
      toast.error("Failed to start conversation");
      setIsStarting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 h-full animate-in fade-in zoom-in-95 duration-500">
      <div className="w-full max-w-2xl flex flex-col items-center">
        <div className="w-16 h-16 bg-card border border-border/50 rounded-[1px] flex items-center justify-center mb-8 shadow-sm relative">
          <div className="absolute inset-0 bg-primary/5 rounded-[1px] blur-xl" />
          <Bot className="w-8 h-8 text-primary/70 relative z-10" />
        </div>
        
        <h2 className="text-2xl font-medium text-foreground mb-8 text-center tracking-tight">
          How can I help you today?
        </h2>

        {availableModels.length > 0 ? (
          <form onSubmit={handleStartChat} className="w-full flex flex-col gap-4">
            <div className="relative flex items-center group w-full rounded-[1px] bg-transparent border border-border/50 transition-all duration-300 focus-within:border-primary/50 focus-within:shadow-[0_0_20px_rgba(255,255,255,0.05)] dark:focus-within:shadow-[0_0_20px_rgba(255,255,255,0.05)]">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".txt,.md,.csv,.json,.js,.py,.html,.css,.ts,.tsx,.pdf"
              />
              <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2" ref={menuRef}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMenuOpen(!menuOpen)}
                  disabled={isUploading || isStarting}
                  className={cn(
                    "h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-card/50",
                    (webSearchEnabled || mcpEnabled) && "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10",
                    mcpEnabled && !webSearchEnabled && "text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
                  )}
                  title="Options"
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  {webSearchEnabled && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                  {mcpEnabled && !webSearchEnabled && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-violet-500" />
                  )}
                </Button>
                {menuOpen && (
                  <div className="absolute left-0 bottom-full mb-2 z-50 w-44 rounded-xl border border-border/80 bg-card p-1 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>Attach file</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWebSearchEnabled(!webSearchEnabled);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <span>Web search</span>
                      </div>
                      <div className={cn(
                        "h-2 w-2 rounded-full transition-all duration-300",
                        webSearchEnabled ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-muted-foreground/30"
                      )} />
                    </button>
                    <button
                      type="button"
                      onClick={toggleMcp}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-muted text-foreground transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Plug className="w-4 h-4 text-muted-foreground" />
                        <span>MCP tools</span>
                      </div>
                      <div className={cn(
                        "h-2 w-2 rounded-full transition-all duration-300",
                        mcpEnabled ? "bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "bg-muted-foreground/30"
                      )} />
                    </button>
                  </div>
                )}
              </div>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message local AI..."
                className={cn(
                  "rounded-[1px] h-14 pl-14 pr-24 bg-transparent border-0 focus-visible:ring-0 text-base shadow-none",
                  (webSearchEnabled || mcpEnabled) && "pl-40"
                )}
                disabled={isStarting || isUploading}
                autoFocus
              />
              {webSearchEnabled && (
                <div className="absolute left-14 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Globe className="h-3 w-3" />
                  <span>Web on</span>
                  <button
                    type="button"
                    onClick={() => setWebSearchEnabled(false)}
                    className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                    aria-label="Turn off web search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {mcpEnabled && (
                <div className={cn(
                  "absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-600 dark:text-violet-400",
                  webSearchEnabled ? "left-36" : "left-14"
                )}>
                  <Plug className="h-3 w-3" />
                  <span>MCP on</span>
                  <button
                    type="button"
                    onClick={() => setMcpEnabled(false)}
                    className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full text-violet-600 hover:bg-violet-500/20 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    aria-label="Turn off MCP tools"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                {speechSupported && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={toggleListening}
                    disabled={isStarting || isUploading}
                    className={cn(
                      "h-10 w-10 rounded-full transition-all duration-300",
                      isListening 
                        ? "text-red-500 bg-red-500/10 hover:bg-red-500/20 animate-pulse" 
                        : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                    )}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                )}
                <Button 
                  type="submit" 
                  disabled={!draft.trim() || !selectedModel || isStarting || isUploading}
                  className="h-10 w-10 p-0 rounded-[1px] hover:bg-primary shadow-md transition-all"
                >
                  {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-start gap-2 mt-2 pl-2">
              <span className="text-xs text-muted-foreground">Using model:</span>
              <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-transparent border border-border/50 text-xs text-foreground rounded-[1px] h-7 px-2 focus:ring-1 focus:ring-primary/50 outline-none w-48"
                disabled={isStarting}
              >
                {servers?.map(server => (
                  <optgroup key={server.id} label={server.name}>
                    {server.models?.map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </form>
        ) : (
          <div className="w-full h-14 flex items-center justify-center border border-dashed border-border/50 rounded-[1px] bg-card/20">
            <p className="text-sm text-muted-foreground">You must connect a Node and install a model to chat.</p>
          </div>
        )}
        <MissingModelAlert isOpen={showMissingModel} onOpenChange={setShowMissingModel} />
      </div>
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useCreateChat } from '@/queries/chats';
import { useServers } from '@/queries/servers';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send, Loader2, Plus, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { MissingModelAlert } from '@/components/chat/MissingModelAlert';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { cn } from '@/lib/utils';

export default function ChatIndexPage() {
  useSocket();
  const router = useRouter();
  const { data: servers } = useServers();
  const createChat = useCreateChat();

  const [draft, setDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showMissingModel, setShowMissingModel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSpeechResult = (text: string) => {
    setDraft(prev => prev + text);
  };
  const { isListening, toggleListening, supported: speechSupported } = useSpeechRecognition(handleSpeechResult);

  const availableModels = servers?.flatMap((s) => s.models || []) || [];

  if (!selectedModel && availableModels.length > 0) {
    setSelectedModel(availableModels[0].id);
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
        body: JSON.stringify({ content: draft })
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isStarting}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-card/50 rounded-full z-10"
                title="Attach Document"
              >
                {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              </Button>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message local AI..."
                className="rounded-[1px] h-14 pl-14 pr-24 bg-transparent border-0 focus-visible:ring-0 text-base shadow-none"
                disabled={isStarting || isUploading}
                autoFocus
              />
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

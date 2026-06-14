'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useChats, useDeleteChat } from '@/queries/chats';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MessageSquare, Plus, Trash2, Loader2, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { data: chats, isLoading } = useChats();
  const deleteChat = useDeleteChat();
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      {/* Sidebar for Chat History */}
      <div 
        className={cn(
          "shrink-0 border-r border-border/40 bg-card/20 flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
          isSidebarOpen ? "w-64 opacity-100" : "w-0 opacity-0 border-r-0"
        )}
      >
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <Button asChild className="flex-1 rounded-[1px] gap-2 shadow-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all mr-2">
            <Link href="/chat">
              <Plus className="w-4 h-4" />
              New Chat
            </Link>
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSidebarOpen(false)}
            className="w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground rounded-[1px]"
            title="Close Sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 w-64">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          ) : !chats || chats.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-4">No history yet</p>
          ) : (
            chats.map((c) => {
              const isActive = pathname === `/chat/${c.id}`;
              return (
                <div 
                  key={c.id} 
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 text-sm rounded-[1px] transition-colors relative",
                    isActive 
                      ? "bg-primary/10 text-primary font-medium" 
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                  )}
                >
                  <Link href={`/chat/${c.id}`} className="absolute inset-0 z-0" />
                  
                  <div className="flex items-center gap-2 truncate z-10 pointer-events-none">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.title || "Untitled"}</span>
                  </div>

                  <div className="flex items-center z-10">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className={cn(
                            "opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive rounded-[1px]",
                            isActive && "opacity-100 text-primary/60 hover:text-destructive"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {deleteChat.isPending && deleteChat.variables === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this conversation.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-[1px]">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            className="rounded-[1px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                              deleteChat.mutate(c.id, {
                                onSuccess: () => {
                                  toast.success("Chat deleted");
                                  if (isActive) router.push('/chat');
                                }
                              });
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
        {/* Reopen Sidebar Button (Only visible when sidebar is closed) */}
        <div className={cn(
          "absolute top-4 left-4 z-50 transition-all duration-300",
          isSidebarOpen ? "opacity-0 pointer-events-none -translate-x-4" : "opacity-100 translate-x-0"
        )}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(true)}
            className="w-10 h-10 bg-card/50 backdrop-blur-md border border-border/50 text-muted-foreground hover:text-foreground rounded-[1px] shadow-sm hover:shadow"
            title="Open Sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
        </div>

        {children}
      </div>
    </div>
  );
}

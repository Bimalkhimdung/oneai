import { Bot } from 'lucide-react';

export default function AgenticModelPage() {
  return (
    <div className="space-y-6 max-w-5xl pb-10">
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          Agentic Model
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and manage models used for agentic workflows.
        </p>
      </div>

      <div className="rounded-[4px] border border-border/80 bg-card/80 p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          Use the autonomous AI Agent for multi-step tasks with tools (web search, Python, memory, database).
        </p>
        <a href="/agent" className="text-sm text-primary hover:underline font-medium">
          Open Agent →
        </a>
      </div>
    </div>
  );
}

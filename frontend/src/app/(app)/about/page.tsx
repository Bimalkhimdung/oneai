export default function AboutPage() {
  return (
    <div className="max-w-4xl space-y-5 pb-10">
      <div>
        <h2 className="text-2xl font-semibold">About</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Local AI Hub helps you connect, manage, and use private AI models from your own infrastructure.
        </p>
      </div>

      <div className="rounded-[4px] border border-border/80 bg-card/80 p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          The project is built for local-first AI workflows: chatting with installed models, comparing responses,
          managing Ollama servers, attaching documents, and running agentic tasks with tools.
        </p>
      </div>
    </div>
  );
}

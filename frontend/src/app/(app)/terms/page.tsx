export default function TermsPage() {
  return (
    <div className="max-w-4xl space-y-5 pb-10">
      <div>
        <h2 className="text-2xl font-semibold">Terms</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Basic usage terms for running Local AI Hub in your environment.
        </p>
      </div>

      <div className="rounded-[4px] border border-border/80 bg-card/80 p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          You are responsible for the models, data, tools, and infrastructure connected to this application.
          Review model licenses and deployment policies before using generated output in production workflows.
        </p>
      </div>
    </div>
  );
}

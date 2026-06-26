export default function ContactPage() {
  return (
    <div className="max-w-4xl space-y-5 pb-10">
      <div>
        <h2 className="text-2xl font-semibold">Contact</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reach out for support, feedback, or deployment questions.
        </p>
      </div>

      <div className="rounded-[4px] border border-border/80 bg-card/80 p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          For now, use your project repository or deployment support channel for questions and issue reports.
        </p>
      </div>
    </div>
  );
}

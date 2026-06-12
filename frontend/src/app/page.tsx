import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Landing() {
  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-8 py-24 text-center">
      <div className="space-y-4">
        <h1 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl">Local AI Hub</h1>
        <p className="mx-auto max-w-xl text-balance text-lg text-muted-foreground">
          Connect, install, and chat with on-premise AI models — no terminal required.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/login">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/register">Create account</Link>
        </Button>
      </div>
    </main>
  );
}

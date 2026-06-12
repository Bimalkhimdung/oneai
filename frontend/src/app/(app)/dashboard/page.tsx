import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          A quick look at your servers, models, and recent activity.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>AI Servers</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">No servers connected yet.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Installed Models</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Connect a server to discover models.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Recent Chats</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Start your first chat to see it here.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

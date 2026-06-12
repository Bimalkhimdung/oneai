export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bokeh bg-grid-dark bg-beams p-6 relative overflow-hidden">{children}</div>
  );
}

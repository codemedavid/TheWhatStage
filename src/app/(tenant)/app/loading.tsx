export default function DashboardLoading() {
  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-lg bg-[var(--ws-border-subtle)]" />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-[var(--ws-border)] bg-white"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl border border-[var(--ws-border)] bg-white lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-xl border border-[var(--ws-border)] bg-white" />
      </div>
    </div>
  );
}

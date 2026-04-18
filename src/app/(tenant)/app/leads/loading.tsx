export default function LeadsLoading() {
  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-8 w-20 animate-pulse rounded-lg bg-[var(--ws-border-subtle)]" />
        <div className="h-5 w-16 animate-pulse rounded bg-[var(--ws-border-subtle)]" />
      </div>
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-64 shrink-0">
            <div className="mb-3 h-5 w-24 animate-pulse rounded bg-[var(--ws-border-subtle)]" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="h-20 animate-pulse rounded-xl border border-[var(--ws-border)] bg-white"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

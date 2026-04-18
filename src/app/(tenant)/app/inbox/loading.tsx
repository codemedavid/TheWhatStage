export default function InboxLoading() {
  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r border-[var(--ws-border)] bg-white p-3">
        <div className="mb-3 h-10 animate-pulse rounded-lg bg-[var(--ws-border-subtle)]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--ws-border-subtle)]" />
            <div className="flex-1">
              <div className="mb-1 h-4 w-24 animate-pulse rounded bg-[var(--ws-border-subtle)]" />
              <div className="h-3 w-32 animate-pulse rounded bg-[var(--ws-border-subtle)]" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center bg-white">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--ws-border-subtle)]" />
      </div>
    </div>
  );
}

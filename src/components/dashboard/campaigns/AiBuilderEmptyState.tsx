// src/components/dashboard/campaigns/AiBuilderEmptyState.tsx
import Link from "next/link";

export function AiBuilderEmptyState() {
  return (
    <div className="rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">Build your first action page</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Funnels need a destination. Create at least one published action page, then come back.
      </p>
      <Link
        href="/app/action-pages"
        className="mt-4 inline-block rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Go to action pages
      </Link>
    </div>
  );
}

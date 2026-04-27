import Link from "next/link";
import { ArrowLeft, Link2, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";

export function AiBuilderEmptyState() {
  return (
    <div className="mx-auto max-w-3xl p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/app/campaigns"
          className="text-[var(--ws-text-muted)] transition-colors hover:text-[var(--ws-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[var(--ws-accent-subtle)] p-1.5">
            <Sparkles className="h-4 w-4 text-[var(--ws-accent)]" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">
            Build with AI
          </h1>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ws-border)] bg-white p-10 text-center shadow-[var(--ws-shadow-sm)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ws-border-subtle)]">
          <Link2 className="h-6 w-6 text-[var(--ws-text-muted)]" />
        </div>
        <h2 className="text-base font-semibold text-[var(--ws-text-primary)]">
          Build your first action page
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--ws-text-muted)]">
          Funnels need a destination. Create at least one published action page,
          then come back to let AI draft your campaign.
        </p>
        <div className="mt-5 flex justify-center">
          <Link href="/app/action-pages">
            <Button variant="primary">Go to action pages</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

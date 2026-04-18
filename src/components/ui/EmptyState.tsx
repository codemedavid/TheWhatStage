import type { LucideIcon } from "lucide-react";
import Button from "./Button";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-[var(--ws-border-subtle)] p-4">
        <Icon className="h-8 w-8 text-[var(--ws-text-muted)]" />
      </div>
      <h3 className="mb-1 text-sm font-medium text-[var(--ws-text-primary)]">
        {title}
      </h3>
      <p className="mb-6 max-w-xs text-sm text-[var(--ws-text-tertiary)]">
        {description}
      </p>
      {actionLabel && actionHref && (
        <a href={actionHref}>
          <Button variant="secondary">{actionLabel}</Button>
        </a>
      )}
    </div>
  );
}

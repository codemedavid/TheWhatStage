import { clsx } from "clsx";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

const styles: Record<BadgeVariant, string> = {
  default: "bg-[var(--ws-border-subtle)] text-[var(--ws-text-secondary)]",
  success: "bg-[var(--ws-success-light)] text-[var(--ws-success)]",
  warning: "bg-[var(--ws-warning-light)] text-[var(--ws-warning)]",
  danger: "bg-[var(--ws-danger-light)] text-[var(--ws-danger)]",
  muted: "bg-[var(--ws-border-subtle)] text-[var(--ws-text-tertiary)]",
};

export default function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

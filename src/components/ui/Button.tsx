import { clsx } from "clsx";
import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const styles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--ws-accent)] text-white hover:bg-[var(--ws-accent-hover)] focus:ring-[var(--ws-focus-ring)]",
  secondary:
    "bg-white text-[var(--ws-text-secondary)] border border-[var(--ws-border-strong)] hover:bg-[var(--ws-page)] focus:ring-[var(--ws-focus-ring)]",
  ghost:
    "text-[var(--ws-text-tertiary)] hover:bg-[var(--ws-border-subtle)] focus:ring-[var(--ws-focus-ring)]",
  danger:
    "text-[var(--ws-danger)] border border-red-200 hover:bg-[var(--ws-danger-light)] focus:ring-red-300",
};

export default function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
        styles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

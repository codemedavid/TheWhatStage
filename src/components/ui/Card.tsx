import { clsx } from "clsx";

export default function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-[var(--ws-border)] bg-white shadow-[var(--ws-shadow-sm)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

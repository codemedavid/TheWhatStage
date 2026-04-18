import { clsx } from "clsx";

export default function StatusDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      className={clsx("inline-block h-2.5 w-2.5 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

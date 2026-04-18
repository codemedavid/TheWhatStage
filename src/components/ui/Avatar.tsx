import { clsx } from "clsx";

export default function Avatar({
  src,
  name,
  size = "sm",
}: {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-lg",
  };

  const initial = (name ?? "?")[0].toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "User"}
        className={clsx("rounded-full object-cover", sizeClasses[size])}
      />
    );
  }

  return (
    <div
      className={clsx(
        "flex items-center justify-center rounded-full bg-[var(--ws-accent-light)] font-medium text-[var(--ws-accent)]",
        sizeClasses[size]
      )}
    >
      {initial}
    </div>
  );
}

import { forwardRef } from "react";
import { clsx } from "clsx";

const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ children, className, ...props }, ref) {
    return (
      <div
        ref={ref}
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
);

export default Card;

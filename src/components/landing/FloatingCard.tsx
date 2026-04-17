interface FloatingCardProps {
  icon: string;
  text: string;
  position: { top?: string; bottom?: string; left?: string; right?: string };
  delay: number;
  duration: number;
}

export function FloatingCard({ icon, text, position, delay, duration }: FloatingCardProps) {
  return (
    <div
      className="absolute hidden md:flex items-center gap-2 pointer-events-none select-none"
      style={{
        ...position,
        background: "#FFFFFF",
        border: "1px solid #E4E4E7",
        borderRadius: "12px",
        padding: "10px 16px",
        boxShadow:
          "rgba(0,0,0,0.04) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 4px 4px, rgba(0,0,0,0.04) 0px 8px 8px, rgba(255,255,255,0.5) 0px 1px 0px inset",
        animation: `float ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        fontSize: "14px",
        fontWeight: 500,
        color: "#061A1C",
        whiteSpace: "nowrap",
      }}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

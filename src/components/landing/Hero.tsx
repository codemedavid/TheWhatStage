import Link from "next/link";
import { FloatingCard } from "./FloatingCard";

export function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        paddingTop: "160px",
        paddingBottom: "120px",
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(54,244,164,0.06) 0%, transparent 60%)",
      }}
    >
      <div className="mx-auto flex max-w-[800px] flex-col items-center px-6 text-center">
        {/* Overline badge */}
        <span
          style={{
            background: "rgba(54, 244, 164, 0.1)",
            color: "#059669",
            padding: "6px 16px",
            borderRadius: "9999px",
            fontSize: "13px",
            fontWeight: 500,
            lineHeight: 1.5,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            marginBottom: "24px",
            display: "inline-block",
          }}
        >
          Messenger Funnels
        </span>

        {/* Headline */}
        <h1
          className="mb-6"
          style={{
            fontSize: "clamp(48px, 8vw, 96px)",
            fontWeight: 300,
            lineHeight: 1.0,
            color: "#061A1C",
            letterSpacing: "-0.02em",
          }}
        >
          Turn Conversations
          <br />
          Into Conversions
        </h1>

        {/* Subtitle */}
        <p
          className="mb-10"
          style={{
            fontSize: "20px",
            fontWeight: 500,
            lineHeight: 1.4,
            letterSpacing: "0.3px",
            color: "#71717A",
            maxWidth: "520px",
          }}
        >
          Build intelligent chatbot funnels that qualify leads, book
          appointments, and close sales — all through Facebook Messenger.
        </p>

        {/* CTA group */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: "#061A1C",
              color: "#FFFFFF",
              padding: "14px 28px 14px 20px",
              borderRadius: "9999px",
              fontSize: "16px",
              fontWeight: 500,
              boxShadow:
                "rgba(0,0,0,0.1) 0px 2px 4px, rgba(0,0,0,0.06) 0px 4px 8px",
            }}
          >
            Get Started Free
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: "transparent",
              color: "#061A1C",
              padding: "12px 26px 12px 18px",
              borderRadius: "9999px",
              fontSize: "16px",
              fontWeight: 500,
              border: "2px solid #061A1C",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#061A1C";
              e.currentTarget.style.color = "#FFFFFF";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#061A1C";
            }}
          >
            See How It Works
          </Link>
        </div>
      </div>

      {/* Floating ambient cards */}
      <FloatingCard
        icon="💬"
        text="New lead captured"
        position={{ top: "25%", left: "5%" }}
        delay={0}
        duration={5}
      />
      <FloatingCard
        icon="📅"
        text="Appointment booked"
        position={{ top: "35%", right: "4%" }}
        delay={1.5}
        duration={4.5}
      />
      <FloatingCard
        icon="🎯"
        text="Stage: Qualified"
        position={{ bottom: "25%", left: "8%" }}
        delay={3}
        duration={5.5}
      />
      <FloatingCard
        icon="💰"
        text="+$2,400 revenue"
        position={{ bottom: "20%", right: "7%" }}
        delay={4.5}
        duration={4}
      />
    </section>
  );
}

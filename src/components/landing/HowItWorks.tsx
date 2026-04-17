"use client";

import { ScrollReveal } from "./ScrollReveal";

const steps = [
  {
    number: "1",
    title: "Connect Messenger",
    description:
      "Link your Facebook page in one click. Our bot starts listening for conversations instantly.",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="6" stroke="#36F4A4" strokeWidth="2" />
        <path d="M14 22h8M14 28h12" stroke="#36F4A4" strokeWidth="2" strokeLinecap="round" />
        <circle cx="36" cy="18" r="4" fill="rgba(54,244,164,0.1)" stroke="#36F4A4" strokeWidth="2" />
        <path d="M34.5 18l1.5 1.5 2.5-3" stroke="#36F4A4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    number: "2",
    title: "Build Your Funnel",
    description:
      "Design action buttons that open forms, calendars, and product pages. Every interaction is tracked.",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <path d="M12 8h24l-4 12h-16l-4-12z" stroke="#36F4A4" strokeWidth="2" strokeLinejoin="round" />
        <path d="M16 20h16l-3 10h-10l-3-10z" stroke="#36F4A4" strokeWidth="2" strokeLinejoin="round" />
        <path d="M19 30h10l-2 8h-6l-2-8z" stroke="#36F4A4" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    number: "3",
    title: "Convert Automatically",
    description:
      "Leads flow through your pipeline. The AI qualifies, stages, and notifies you when they're ready.",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="16" stroke="#36F4A4" strokeWidth="2" />
        <path d="M18 24l4 4 8-8" stroke="#36F4A4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      style={{ background: "#FAFBFC", padding: "120px 0" }}
    >
      <div className="mx-auto max-w-[1280px] px-6 md:px-16">
        {/* Section header */}
        <ScrollReveal className="mb-16 text-center">
          <h2
            style={{
              fontSize: "clamp(32px, 5vw, 55px)",
              fontWeight: 300,
              lineHeight: 1.16,
              color: "#061A1C",
              marginBottom: "16px",
            }}
          >
            How It Works
          </h2>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 400,
              lineHeight: 1.56,
              color: "#71717A",
              maxWidth: "500px",
              margin: "0 auto",
            }}
          >
            Three steps to transform your Messenger into a lead-converting
            machine.
          </p>
        </ScrollReveal>

        {/* Steps */}
        <div className="relative grid grid-cols-1 gap-16 md:grid-cols-3 md:gap-8">
          {/* Connector lines (desktop only) */}
          <div
            className="pointer-events-none absolute top-12 left-[20%] right-[20%] hidden md:block"
            style={{
              height: "2px",
              backgroundImage:
                "repeating-linear-gradient(to right, #E4E4E7 0, #E4E4E7 8px, transparent 8px, transparent 16px)",
            }}
          />

          {steps.map((step, i) => (
            <ScrollReveal
              key={step.number}
              delay={i * 150}
              className="relative flex flex-col items-center text-center"
            >
              {/* Number circle */}
              <div
                className="mb-6 flex items-center justify-center"
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(54,244,164,0.1)",
                  color: "#059669",
                  fontSize: "24px",
                  fontWeight: 700,
                }}
              >
                {step.number}
              </div>

              {/* Icon */}
              <div className="mb-4">{step.icon}</div>

              {/* Title */}
              <h3
                style={{
                  fontSize: "24px",
                  fontWeight: 400,
                  lineHeight: 1.14,
                  letterSpacing: "0.36px",
                  color: "#061A1C",
                  marginBottom: "12px",
                }}
              >
                {step.title}
              </h3>

              {/* Description */}
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 400,
                  lineHeight: 1.5,
                  color: "#71717A",
                  maxWidth: "300px",
                }}
              >
                {step.description}
              </p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

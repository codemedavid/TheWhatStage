"use client";

import Link from "next/link";
import { ScrollReveal } from "./ScrollReveal";

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "Get started with the basics",
    features: [
      "1 Messenger bot",
      "100 leads/month",
      "3 action pages",
      "Basic pipeline",
      "Community support",
    ],
    cta: "Start Free",
    ctaStyle: "ghost" as const,
    recommended: false,
  },
  {
    name: "Pro",
    price: "$49",
    description: "Everything you need to grow",
    features: [
      "Unlimited bots",
      "Unlimited leads",
      "Unlimited action pages",
      "Advanced pipeline & stages",
      "Workflow automation",
      "Priority support",
    ],
    cta: "Get Started",
    ctaStyle: "filled" as const,
    recommended: true,
  },
  {
    name: "Enterprise",
    price: "$149",
    description: "For teams that need more",
    features: [
      "Everything in Pro",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantees",
      "White-label options",
      "API access",
    ],
    cta: "Contact Sales",
    ctaStyle: "ghost" as const,
    recommended: false,
  },
];

const cardShadow =
  "rgba(0,0,0,0.04) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 4px 4px, rgba(0,0,0,0.04) 0px 8px 8px, rgba(255,255,255,0.5) 0px 1px 0px inset";

const elevatedShadow =
  "rgba(0,0,0,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.06) 0px 4px 4px, rgba(0,0,0,0.06) 0px 8px 8px, rgba(0,0,0,0.06) 0px 16px 16px, rgba(0,0,0,0.04) 0px 24px 32px, rgba(255,255,255,0.5) 0px 1px 0px inset";

export function Pricing() {
  return (
    <section id="pricing" style={{ background: "#FAFBFC", padding: "120px 0" }}>
      <div className="mx-auto max-w-[1280px] px-6 md:px-16">
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
            Simple, Transparent Pricing
          </h2>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 400,
              lineHeight: 1.56,
              color: "#71717A",
            }}
          >
            Start free. Upgrade when you&apos;re ready.
          </p>
        </ScrollReveal>

        <div className="mx-auto grid max-w-[960px] grid-cols-1 gap-6 md:grid-cols-3">
          {tiers.map((tier, i) => (
            <ScrollReveal key={tier.name} delay={i * 150}>
              <div
                className="relative flex h-full flex-col"
                style={{
                  background: "#FFFFFF",
                  border: tier.recommended
                    ? "2px solid #36F4A4"
                    : "1px solid #E4E4E7",
                  borderRadius: "12px",
                  padding: "40px",
                  boxShadow: tier.recommended ? elevatedShadow : cardShadow,
                  transform: tier.recommended ? "scale(1.02)" : "none",
                }}
              >
                {tier.recommended && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2"
                    style={{
                      background: "#36F4A4",
                      color: "#061A1C",
                      padding: "4px 16px",
                      borderRadius: "9999px",
                      fontSize: "12px",
                      fontWeight: 600,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Most Popular
                  </span>
                )}

                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "#71717A",
                    marginBottom: "16px",
                  }}
                >
                  {tier.name}
                </p>

                <div className="mb-2 flex items-baseline gap-1">
                  <span
                    style={{
                      fontSize: "55px",
                      fontWeight: 300,
                      lineHeight: 1,
                      color: "#061A1C",
                    }}
                  >
                    {tier.price}
                  </span>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 400,
                      color: "#A1A1AA",
                    }}
                  >
                    /mo
                  </span>
                </div>

                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    color: "#71717A",
                    marginBottom: "32px",
                  }}
                >
                  {tier.description}
                </p>

                <ul className="mb-8 flex flex-1 flex-col gap-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        className="mt-0.5 shrink-0"
                      >
                        <path
                          d="M6 10l3 3 5-6"
                          stroke="#36F4A4"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span
                        style={{
                          fontSize: "16px",
                          fontWeight: 400,
                          color: "#061A1C",
                        }}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.name === "Enterprise" ? "#faq" : "/signup"}
                  className="block w-full text-center transition-all duration-200 hover:scale-[1.02]"
                  style={
                    tier.ctaStyle === "filled"
                      ? {
                          background: "#061A1C",
                          color: "#FFFFFF",
                          padding: "14px 24px",
                          borderRadius: "9999px",
                          fontSize: "16px",
                          fontWeight: 500,
                        }
                      : {
                          background: "transparent",
                          color: "#061A1C",
                          padding: "12px 22px",
                          borderRadius: "9999px",
                          fontSize: "16px",
                          fontWeight: 500,
                          border: "2px solid #061A1C",
                        }
                  }
                >
                  {tier.cta}
                </Link>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

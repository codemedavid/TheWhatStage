"use client";

import { ScrollReveal } from "./ScrollReveal";

const useCases = [
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="8" width="32" height="24" rx="4" stroke="#36F4A4" strokeWidth="2" />
        <path d="M4 16h32" stroke="#36F4A4" strokeWidth="2" />
        <circle cx="12" cy="24" r="3" stroke="#36F4A4" strokeWidth="1.5" />
        <path d="M20 22h10M20 26h7" stroke="#36F4A4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "E-Commerce",
    subtitle: "Product Discovery via Chat",
    description:
      "Send product carousels through Messenger. Leads browse, add to cart, and checkout without leaving the conversation flow.",
    metric: "2.4x higher AOV",
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="6" y="6" width="28" height="28" rx="4" stroke="#36F4A4" strokeWidth="2" />
        <path d="M6 14h28M14 14v20" stroke="#36F4A4" strokeWidth="2" />
        <circle cx="27" cy="24" r="4" stroke="#36F4A4" strokeWidth="1.5" />
        <path d="M25.5 24l1.2 1.2 2.3-2.4" stroke="#36F4A4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Real Estate",
    subtitle: "Qualify Buyers Instantly",
    description:
      "Capture budget, location, and timeline through conversational questions. Only serious buyers reach your calendar.",
    metric: "68% qualification rate",
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="14" stroke="#36F4A4" strokeWidth="2" />
        <path d="M20 10v10l6 4" stroke="#36F4A4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Services",
    subtitle: "Book Appointments on Autopilot",
    description:
      "From initial inquiry to confirmed booking in under 2 minutes. Action buttons open your calendar directly from chat.",
    metric: "3x more bookings",
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M8 32V12l12-6 12 6v20l-12 4-12-4z" stroke="#36F4A4" strokeWidth="2" strokeLinejoin="round" />
        <path d="M8 12l12 6 12-6M20 18v18" stroke="#36F4A4" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
    title: "Digital Products",
    subtitle: "Segment & Sell",
    description:
      "Understand buyer intent through chat, then deliver the perfect sales page. Each lead gets a personalized funnel path.",
    metric: "41% conversion lift",
  },
];

const cardShadow =
  "rgba(0,0,0,0.04) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 4px 4px, rgba(0,0,0,0.04) 0px 8px 8px, rgba(255,255,255,0.5) 0px 1px 0px inset";

const cardShadowHover =
  "rgba(0,0,0,0.06) 0px 0px 0px 1px, rgba(0,0,0,0.06) 0px 4px 4px, rgba(0,0,0,0.06) 0px 8px 8px, rgba(0,0,0,0.06) 0px 16px 16px, rgba(255,255,255,0.5) 0px 1px 0px inset";

export function UseCases() {
  return (
    <section id="use-cases" style={{ padding: "120px 0" }}>
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
            Built For Every Business
          </h2>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 400,
              lineHeight: 1.56,
              color: "#71717A",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            Whether you sell products, services, or appointments — WhatStage
            adapts to your workflow.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {useCases.map((uc, i) => (
            <ScrollReveal key={uc.title} delay={i * 150}>
              <div
                className="h-full cursor-default transition-all duration-200"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E4E4E7",
                  borderRadius: "12px",
                  padding: "32px",
                  boxShadow: cardShadow,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = cardShadowHover;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = cardShadow;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div className="mb-4">{uc.icon}</div>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    letterSpacing: "0.28px",
                    color: "#A1A1AA",
                    marginBottom: "4px",
                  }}
                >
                  {uc.title}
                </p>
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
                  {uc.subtitle}
                </h3>
                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: 400,
                    lineHeight: 1.5,
                    color: "#71717A",
                    marginBottom: "16px",
                  }}
                >
                  {uc.description}
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#059669",
                  }}
                >
                  {uc.metric}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

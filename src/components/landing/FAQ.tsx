"use client";

import { useState } from "react";
import { ScrollReveal } from "./ScrollReveal";

const faqs = [
  {
    q: "What is a Messenger Funnel?",
    a: "A Messenger Funnel uses Facebook Messenger as the entry point for your sales pipeline. Instead of cold landing pages, leads interact through chat, click action buttons that open web pages (forms, calendars, product pages), and every interaction is automatically tracked and staged in your pipeline.",
  },
  {
    q: "Do I need coding skills?",
    a: "Not at all. WhatStage provides a visual builder for your bot flows, action pages, and workflows. Connect your Facebook page, configure your funnel steps, and you're live in minutes.",
  },
  {
    q: "How does lead tracking work?",
    a: "Every lead that interacts with your Messenger bot is automatically tracked. When they click an action button and visit a web page, their Facebook user ID ties the activity back to their profile. You see every form fill, booking, and purchase in one timeline.",
  },
  {
    q: "Can I customize the action pages?",
    a: "Yes. Action pages are fully customizable web pages that open from Messenger buttons. You can create lead capture forms, booking calendars, product catalogs with cart/checkout, and sales pages — all branded to your business.",
  },
  {
    q: "What happens when I hit my lead limit on Free?",
    a: "You'll be notified as you approach your limit. Existing leads continue to work normally. To capture new leads beyond 100/month, upgrade to Pro for unlimited leads.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. Each tenant's data is fully isolated. We use Supabase (built on PostgreSQL) with row-level security. Your leads, conversations, and configurations are never shared across accounts.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" style={{ padding: "120px 0" }}>
      <div className="mx-auto max-w-[680px] px-6 md:px-16">
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
            Frequently Asked Questions
          </h2>
        </ScrollReveal>

        <div>
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <ScrollReveal key={i} delay={i * 80}>
                <div
                  style={{
                    borderBottom: "1px solid #E4E4E7",
                  }}
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="flex w-full items-center justify-between py-6 text-left"
                  >
                    <span
                      style={{
                        fontSize: "18px",
                        fontWeight: 500,
                        color: "#061A1C",
                        paddingRight: "16px",
                      }}
                    >
                      {faq.q}
                    </span>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      className="shrink-0 transition-transform duration-300"
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    >
                      <path
                        d="M5 8l5 5 5-5"
                        stroke="#71717A"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <div className={`faq-answer ${isOpen ? "open" : ""}`}>
                    <div>
                      <p
                        style={{
                          fontSize: "16px",
                          fontWeight: 400,
                          lineHeight: 1.56,
                          color: "#71717A",
                          paddingBottom: "24px",
                        }}
                      >
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

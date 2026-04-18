# WhatStage Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Shopify-grade SaaS marketing landing page for WhatStage with light theme, scroll animations, and ambient motion.

**Architecture:** Single-page composition in the existing `(marketing)` route group. Each section is an isolated client component in `src/components/landing/`. A shared `ScrollReveal` wrapper handles Intersection Observer animations. All styling via Tailwind CSS utility classes + inline CSS custom properties for design tokens. No external animation libraries.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Geist font (already configured)

---

### Task 1: Design Tokens & Global Styles

**Files:**
- Modify: `src/app/globals.css`

This task sets up the light-theme color tokens and animation keyframes used by all landing page components. Every subsequent task depends on these tokens.

- [ ] **Step 1: Update globals.css with landing page tokens and keyframes**

Replace the contents of `src/app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #061A1C;

  /* Landing page design tokens */
  --color-deep-teal: #061A1C;
  --color-dark-forest: #061A1C;
  --color-forest: #102620;
  --color-neon-green: #36F4A4;
  --color-accent-readable: #059669;
  --color-accent-bg: rgba(54, 244, 164, 0.1);
  --color-muted: #71717A;
  --color-tertiary: #A1A1AA;
  --color-border: #E4E4E7;
  --color-surface-alt: #FAFBFC;
  --color-card-shadow: rgba(0, 0, 0, 0.04);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  font-feature-settings: 'ss03';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Floating card animation */
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

/* Scroll reveal base state */
[data-reveal] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 600ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
}

[data-reveal].revealed {
  opacity: 1;
  transform: translateY(0);
}

/* FAQ expand/collapse */
.faq-answer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease;
}

.faq-answer.open {
  grid-template-rows: 1fr;
}

.faq-answer > div {
  overflow: hidden;
}
```

- [ ] **Step 2: Verify the dev server starts without errors**

Run: `cd /Users/codemedavid/Documents/WhatStage_V2 && npm run dev`
Expected: Compiles without CSS errors. Page loads at localhost:3000.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(landing): add light-theme design tokens and animation keyframes"
```

---

### Task 2: ScrollReveal Component

**Files:**
- Create: `src/components/landing/ScrollReveal.tsx`

A client component that wraps children and uses IntersectionObserver to add `.revealed` class when visible. All section animations depend on this.

- [ ] **Step 1: Write ScrollReveal component**

Create `src/components/landing/ScrollReveal.tsx`:

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function ScrollReveal({ children, className = "", delay = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.classList.add("revealed");
          }, delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} data-reveal className={className}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/ScrollReveal.tsx
git commit -m "feat(landing): add ScrollReveal intersection observer component"
```

---

### Task 3: Navbar Component

**Files:**
- Create: `src/components/landing/Navbar.tsx`

Sticky nav with transparent-to-frosted-glass transition on scroll. Logo left, nav links center, CTA pill right. Mobile hamburger menu.

- [ ] **Step 1: Write the Navbar component**

Create `src/components/landing/Navbar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(255,255,255,0.8)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid #E4E4E7" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 md:px-16">
        {/* Logo */}
        <Link
          href="/"
          className="text-xl font-bold tracking-tight"
          style={{ color: "#061A1C" }}
        >
          WhatStage
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors duration-200"
              style={{
                fontSize: "16px",
                fontWeight: 500,
                lineHeight: 1.25,
                letterSpacing: "0.3px",
                color: "#061A1C",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#A1A1AA")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#061A1C")}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <Link
          href="/signup"
          className="hidden md:inline-flex items-center transition-all duration-200 hover:scale-[1.02]"
          style={{
            background: "#061A1C",
            color: "#FFFFFF",
            padding: "10px 24px 10px 18px",
            borderRadius: "9999px",
            fontSize: "16px",
            fontWeight: 500,
          }}
        >
          Start for free
        </Link>

        {/* Mobile hamburger */}
        <button
          className="flex flex-col gap-1.5 md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span
            className="block h-0.5 w-6 transition-all duration-200"
            style={{
              background: "#061A1C",
              transform: menuOpen ? "rotate(45deg) translate(4px, 4px)" : "none",
            }}
          />
          <span
            className="block h-0.5 w-6 transition-all duration-200"
            style={{
              background: "#061A1C",
              opacity: menuOpen ? 0 : 1,
            }}
          />
          <span
            className="block h-0.5 w-6 transition-all duration-200"
            style={{
              background: "#061A1C",
              transform: menuOpen ? "rotate(-45deg) translate(4px, -4px)" : "none",
            }}
          />
        </button>
      </div>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 top-16 flex flex-col items-center justify-center gap-8 md:hidden"
          style={{ background: "#061A1C" }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="text-2xl font-light"
              style={{ color: "#FFFFFF" }}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/signup"
            onClick={() => setMenuOpen(false)}
            style={{
              background: "#36F4A4",
              color: "#061A1C",
              padding: "14px 32px",
              borderRadius: "9999px",
              fontSize: "18px",
              fontWeight: 500,
            }}
          >
            Start for free
          </Link>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Navbar.tsx
git commit -m "feat(landing): add sticky Navbar with frosted glass scroll effect"
```

---

### Task 4: FloatingCard & Hero Component

**Files:**
- Create: `src/components/landing/FloatingCard.tsx`
- Create: `src/components/landing/Hero.tsx`

Hero section with center-aligned headline, overline badge, subtitle, two pill CTAs, and ambient floating notification cards.

- [ ] **Step 1: Write the FloatingCard component**

Create `src/components/landing/FloatingCard.tsx`:

```tsx
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
```

- [ ] **Step 2: Write the Hero component**

Create `src/components/landing/Hero.tsx`:

```tsx
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/FloatingCard.tsx src/components/landing/Hero.tsx
git commit -m "feat(landing): add Hero section with floating notification cards"
```

---

### Task 5: HowItWorks Component

**Files:**
- Create: `src/components/landing/HowItWorks.tsx`

Three-step horizontal layout with number circles, animated SVG icons, connector lines, and scroll-reveal entrances.

- [ ] **Step 1: Write the HowItWorks component**

Create `src/components/landing/HowItWorks.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/HowItWorks.tsx
git commit -m "feat(landing): add HowItWorks 3-step section with connector lines"
```

---

### Task 6: UseCases Component

**Files:**
- Create: `src/components/landing/UseCases.tsx`

2x2 card grid with SVG icons, descriptions, metric highlights, and hover elevation effects.

- [ ] **Step 1: Write the UseCases component**

Create `src/components/landing/UseCases.tsx`:

```tsx
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

        {/* Cards grid */}
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/UseCases.tsx
git commit -m "feat(landing): add UseCases 2x2 card grid section"
```

---

### Task 7: Pricing Component

**Files:**
- Create: `src/components/landing/Pricing.tsx`

Three-tier pricing cards with feature lists, recommended tier badge, and ghost/filled pill CTAs.

- [ ] **Step 1: Write the Pricing component**

Create `src/components/landing/Pricing.tsx`:

```tsx
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
            Start free. Upgrade when you're ready.
          </p>
        </ScrollReveal>

        {/* Pricing cards */}
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
                {/* Recommended badge */}
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

                {/* Tier name */}
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

                {/* Price */}
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

                {/* Description */}
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

                {/* Features */}
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

                {/* CTA */}
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Pricing.tsx
git commit -m "feat(landing): add 3-tier Pricing section with recommended badge"
```

---

### Task 8: FAQ Component

**Files:**
- Create: `src/components/landing/FAQ.tsx`

Accordion-style FAQ with smooth expand/collapse using CSS grid trick. Chevron rotates on open.

- [ ] **Step 1: Write the FAQ component**

Create `src/components/landing/FAQ.tsx`:

```tsx
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
            Frequently Asked Questions
          </h2>
        </ScrollReveal>

        {/* FAQ items */}
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/FAQ.tsx
git commit -m "feat(landing): add FAQ accordion section with smooth expand/collapse"
```

---

### Task 9: Footer Component

**Files:**
- Create: `src/components/landing/Footer.tsx`

Dark-themed footer with 4-column layout, link groups, and copyright bar.

- [ ] **Step 1: Write the Footer component**

Create `src/components/landing/Footer.tsx`:

```tsx
import Link from "next/link";

const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "Integrations", href: "#" },
      { label: "API", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Security", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer style={{ background: "#061A1C" }}>
      <div className="mx-auto max-w-[1280px] px-6 md:px-16" style={{ paddingTop: "80px", paddingBottom: "40px" }}>
        {/* Main footer content */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
          {/* Brand column */}
          <div>
            <Link
              href="/"
              className="text-xl font-bold tracking-tight"
              style={{ color: "#FFFFFF" }}
            >
              WhatStage
            </Link>
            <p
              className="mt-4"
              style={{
                fontSize: "16px",
                fontWeight: 400,
                lineHeight: 1.5,
                color: "#A1A1AA",
                maxWidth: "260px",
              }}
            >
              Turn Messenger conversations into high-converting funnels. Qualify,
              nurture, and close — all on autopilot.
            </p>
          </div>

          {/* Link columns */}
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "#FFFFFF",
                  marginBottom: "20px",
                }}
              >
                {group.title}
              </h4>
              <ul className="flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="transition-colors duration-200"
                      style={{
                        fontSize: "16px",
                        fontWeight: 400,
                        color: "#A1A1AA",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "#FFFFFF")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "#A1A1AA")
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="mt-16 pt-8"
          style={{ borderTop: "1px solid #1E2C31" }}
        >
          <p
            style={{
              fontSize: "14px",
              fontWeight: 400,
              color: "#71717A",
            }}
          >
            &copy; 2026 WhatStage. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Footer.tsx
git commit -m "feat(landing): add dark Footer with 4-column link layout"
```

---

### Task 10: Compose Landing Page

**Files:**
- Modify: `src/app/(marketing)/page.tsx`

Wire all components together into the final landing page. This replaces the current placeholder content.

- [ ] **Step 1: Rewrite the marketing page to compose all sections**

Replace the contents of `src/app/(marketing)/page.tsx` with:

```tsx
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { UseCases } from "@/components/landing/UseCases";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

export default function MarketingHomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <UseCases />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: No type errors.

- [ ] **Step 3: Start the dev server and visually verify**

Run: `npm run dev`
Open `http://localhost:3000` in the browser. Verify:
- Navbar is sticky, transparent initially, frosted glass on scroll
- Hero has floating cards, correct typography (light 300 weight, large size)
- Sections alternate backgrounds (white / #FAFBFC)
- Scroll animations trigger as you scroll down
- Cards have multi-layer shadows and hover elevation
- Pricing "Most Popular" badge shows on Pro tier
- FAQ accordion expands/collapses smoothly
- Footer is dark themed
- Mobile responsive: hamburger nav, stacked columns

- [ ] **Step 4: Commit**

```bash
git add src/app/(marketing)/page.tsx
git commit -m "feat(landing): compose full landing page with all sections"
```

---

### Task 11: Responsive Polish & Final Adjustments

**Files:**
- Modify: `src/app/(marketing)/page.tsx` (if needed)
- Modify: various `src/components/landing/*.tsx` (as needed)

Test at all breakpoints and fix any responsive issues. This task is intentionally flexible — the specific fixes depend on what the visual check in Task 10 reveals.

- [ ] **Step 1: Test at mobile (375px), tablet (768px), and desktop (1280px+)**

Open browser DevTools, toggle responsive mode. Check each breakpoint:
- **375px**: Single column, hamburger nav, hero headline ~48px, floating cards hidden, pricing stacked
- **768px**: 2-column grids begin, hero headline ~70px
- **1280px+**: Full layout, 96px hero headline, max-width container centered

- [ ] **Step 2: Fix any issues found**

Common fixes: padding adjustments on mobile, ensuring text doesn't overflow, cards stack properly. Apply fixes directly to the affected components.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix(landing): responsive polish across all breakpoints"
```

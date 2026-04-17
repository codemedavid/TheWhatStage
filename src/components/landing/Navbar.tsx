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

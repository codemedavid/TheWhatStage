"use client";

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
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
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

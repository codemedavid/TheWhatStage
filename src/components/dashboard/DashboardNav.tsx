"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  Home,
  MessageSquare,
  Users,
  Bot,
  Link2,
  Zap,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useEscalationCount } from "@/hooks/useEscalationCount";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/leads", label: "Leads", icon: Users },
  { href: "/app/bot", label: "Bot", icon: Bot },
  { href: "/app/actions", label: "Actions", icon: Link2 },
  { href: "/app/workflows", label: "Workflows", icon: Zap },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

export default function DashboardNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const escalationCount = useEscalationCount();

  const navContent = (
    <>
      <div className="flex items-center justify-between border-b border-[var(--ws-border)] px-4 py-4">
        <div>
          <span className="text-sm font-semibold text-[var(--ws-text-primary)]">
            {tenantSlug}
          </span>
          <p className="text-xs text-[var(--ws-text-muted)]">.whatstage.app</p>
        </div>
        <button
          className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)] md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-0.5",
                active
                  ? "bg-[var(--ws-accent-subtle)] text-[var(--ws-accent)]"
                  : "text-[var(--ws-text-secondary)] hover:bg-[var(--ws-page)]"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[var(--ws-accent)]" />
              )}
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.label === "Inbox" && escalationCount > 0 && (
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--ws-danger)] px-1.5 text-[10px] font-bold text-white">
                  {escalationCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--ws-border)] px-2 py-3">
        <Link
          href="/app/settings"
          onClick={() => setMobileOpen(false)}
          className={clsx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/app/settings")
              ? "bg-[var(--ws-accent-subtle)] text-[var(--ws-accent)]"
              : "text-[var(--ws-text-secondary)] hover:bg-[var(--ws-page)]"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed left-4 top-4 z-40 rounded-lg bg-white p-2 text-[var(--ws-text-tertiary)] shadow-[var(--ws-shadow-sm)] md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — mobile (slide-out) */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-56 flex-col bg-white border-r border-[var(--ws-border)] transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Sidebar — desktop (static) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--ws-border)] bg-white md:flex">
        {navContent}
      </aside>
    </>
  );
}

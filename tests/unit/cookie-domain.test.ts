import { describe, expect, it, beforeEach } from "vitest";

describe("cookie domain helpers", () => {
  const originalDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = originalDomain;
  });

  it("returns the shared cookie domain from a host with port", async () => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = "lvh.me:3000";
    const { getCookieDomain } = await import("@/lib/supabase/cookie-domain");

    expect(getCookieDomain()).toBe(".lvh.me");
  });

  it("returns the shared cookie domain from a full app URL", async () => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = "https://pluckless-jonas-uninclinable.ngrok-free.dev";
    const { getCookieDomain } = await import("@/lib/supabase/cookie-domain");

    expect(getCookieDomain()).toBe(".pluckless-jonas-uninclinable.ngrok-free.dev");
  });

  it("uses host-only cookies for localhost", async () => {
    process.env.NEXT_PUBLIC_APP_DOMAIN = "http://localhost:3000";
    const { getCookieDomain } = await import("@/lib/supabase/cookie-domain");

    expect(getCookieDomain()).toBeUndefined();
  });
});

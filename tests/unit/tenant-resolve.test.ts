import { describe, it, expect } from "vitest";
import { extractSubdomain } from "@/lib/tenant/resolve";

describe("extractSubdomain", () => {
  it("extracts subdomain from production domain", () => {
    expect(extractSubdomain("acme.whatstage.app")).toBe("acme");
    expect(extractSubdomain("my-business.whatstage.app")).toBe("my-business");
  });

  it("extracts subdomain from local dev domain", () => {
    expect(extractSubdomain("acme.lvh.me")).toBe("acme");
    expect(extractSubdomain("acme.lvh.me:3000")).toBe("acme");
  });

  it("returns null for the root domain", () => {
    expect(extractSubdomain("whatstage.app")).toBeNull();
    expect(extractSubdomain("lvh.me")).toBeNull();
  });

  it("returns null for unrelated domains", () => {
    expect(extractSubdomain("example.com")).toBeNull();
  });

  it("extracts tenant subdomains from the configured app domain", () => {
    const originalDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    process.env.NEXT_PUBLIC_APP_DOMAIN = "https://pluckless-jonas-uninclinable.ngrok-free.dev";

    expect(extractSubdomain("acme.pluckless-jonas-uninclinable.ngrok-free.dev")).toBe("acme");
    expect(extractSubdomain("pluckless-jonas-uninclinable.ngrok-free.dev")).toBeNull();

    process.env.NEXT_PUBLIC_APP_DOMAIN = originalDomain;
  });
});

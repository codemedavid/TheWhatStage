import { describe, it, expect } from "vitest";
import { buildActionPageUrl } from "@/lib/fb/action-url";

describe("buildActionPageUrl", () => {
  it("builds a signed URL with psid and sig parameters", () => {
    const url = buildActionPageUrl({
      tenantSlug: "acme",
      actionPageSlug: "free-consultation",
      psid: "123456",
      appSecret: "test-secret",
      appDomain: "whatstage.com",
      protocol: "https",
    });

    expect(url).toContain("https://acme.whatstage.com/a/free-consultation");
    expect(url).toContain("psid=123456");
    expect(url).toContain("sig=");
  });

  it("uses http for local development domains", () => {
    const url = buildActionPageUrl({
      tenantSlug: "acme",
      actionPageSlug: "booking",
      psid: "789",
      appSecret: "secret",
      appDomain: "lvh.me:3000",
      protocol: "http",
    });

    expect(url).toMatch(/^http:\/\/acme\.lvh\.me:3000\/a\/booking/);
  });

  it("produces consistent signatures for the same psid and secret", () => {
    const params = {
      tenantSlug: "acme",
      actionPageSlug: "form",
      psid: "same-psid",
      appSecret: "same-secret",
      appDomain: "whatstage.com",
      protocol: "https" as const,
    };

    const url1 = buildActionPageUrl(params);
    const url2 = buildActionPageUrl(params);

    expect(url1).toBe(url2);
  });
});

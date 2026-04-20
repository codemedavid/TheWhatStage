import { describe, it, expect, vi } from "vitest";
import { scrapeUrl } from "@/lib/onboarding/scraper";

describe("scrapeUrl", () => {
  it("strips HTML tags and returns clean text", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          "<html><body><nav>Menu</nav><h1>Welcome</h1><p>We sell bags.</p><script>alert(1)</script></body></html>"
        ),
    });

    const result = await scrapeUrl("https://example.com");

    expect(result).toContain("Welcome");
    expect(result).toContain("We sell bags.");
    expect(result).not.toContain("<h1>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("returns null on fetch failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const result = await scrapeUrl("https://example.com/404");

    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await scrapeUrl("https://example.com");

    expect(result).toBeNull();
  });

  it("decodes HTML entities", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<p>Bags &amp; wallets, price &lt; $300</p>"),
    });

    const result = await scrapeUrl("https://example.com");

    expect(result).toContain("Bags & wallets");
    expect(result).toContain("price < $300");
  });

  it("truncates output to 5000 chars", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<p>" + "a".repeat(6000) + "</p>"),
    });

    const result = await scrapeUrl("https://example.com");

    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(5000);
  });
});

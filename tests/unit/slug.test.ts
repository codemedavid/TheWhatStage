import { describe, it, expect } from "vitest";
import { generateSlug, validateSlug, isReservedSlug } from "@/lib/utils/slug";

describe("generateSlug", () => {
  it("converts a business name to a slug", () => {
    expect(generateSlug("Acme Corp")).toBe("acme-corp");
  });

  it("strips special characters", () => {
    expect(generateSlug("John's Pizza!")).toBe("johns-pizza");
  });

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("-hello-")).toBe("hello");
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("a    b   c")).toBe("a-b-c");
  });

  it("handles unicode by stripping non-ascii", () => {
    expect(generateSlug("café soleil")).toBe("caf-soleil");
  });

  it("returns empty string for empty input", () => {
    expect(generateSlug("")).toBe("");
  });

  it("handles single character names", () => {
    expect(generateSlug("A")).toBe("a");
  });
});

describe("validateSlug", () => {
  it("returns null for a valid slug", () => {
    expect(validateSlug("acme-corp")).toBeNull();
    expect(validateSlug("abc")).toBeNull();
    expect(validateSlug("my-business-123")).toBeNull();
  });

  it("returns error for empty slug", () => {
    expect(validateSlug("")).toBe("Slug is required");
  });

  it("returns error for slug shorter than 3 characters", () => {
    expect(validateSlug("ab")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for slug with uppercase letters", () => {
    expect(validateSlug("Acme")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for slug starting with a hyphen", () => {
    expect(validateSlug("-abc")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for slug ending with a hyphen", () => {
    expect(validateSlug("abc-")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for reserved slugs", () => {
    expect(validateSlug("www")).toBe("This subdomain is reserved");
    expect(validateSlug("app")).toBe("This subdomain is reserved");
    expect(validateSlug("api")).toBe("This subdomain is reserved");
  });
});

describe("isReservedSlug", () => {
  it("returns true for reserved slugs", () => {
    expect(isReservedSlug("www")).toBe(true);
    expect(isReservedSlug("app")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
  });

  it("returns false for non-reserved slugs", () => {
    expect(isReservedSlug("acme")).toBe(false);
    expect(isReservedSlug("my-shop")).toBe(false);
  });
});

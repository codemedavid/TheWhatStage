import { describe, it, expect } from "vitest";
import { normalizeKey } from "@/lib/leads/key-normalizer";

describe("normalizeKey", () => {
  it("maps 'Business Type' to 'business'", () => {
    expect(normalizeKey("Business Type")).toBe("business");
  });

  it("maps 'company' to 'business'", () => {
    expect(normalizeKey("company")).toBe("business");
  });

  it("maps 'Company Name' to 'business'", () => {
    expect(normalizeKey("Company Name")).toBe("business");
  });

  it("maps 'phone number' to 'phone'", () => {
    expect(normalizeKey("phone number")).toBe("phone");
  });

  it("maps 'email address' to 'email'", () => {
    expect(normalizeKey("email address")).toBe("email");
  });

  it("maps 'Budget Range' to 'budget'", () => {
    expect(normalizeKey("Budget Range")).toBe("budget");
  });

  it("maps 'city' to 'location'", () => {
    expect(normalizeKey("city")).toBe("location");
  });

  it("maps 'first name' to 'first_name'", () => {
    expect(normalizeKey("first name")).toBe("first_name");
  });

  it("maps 'last name' to 'last_name'", () => {
    expect(normalizeKey("last name")).toBe("last_name");
  });

  it("passes through unknown keys in lowercase", () => {
    expect(normalizeKey("Favorite Color")).toBe("favorite color");
  });

  it("trims and lowercases input", () => {
    expect(normalizeKey("  BUDGET  ")).toBe("budget");
  });
});

import { describe, it, expect } from "vitest";
import { classifyQuery } from "@/lib/ai/query-router";

describe("classifyQuery", () => {
  it("routes price-related queries to product", () => {
    expect(classifyQuery("How much does it cost?")).toBe("product");
    expect(classifyQuery("What's the price of the widget?")).toBe("product");
    expect(classifyQuery("Do you have any deals?")).toBe("product");
    expect(classifyQuery("What products do you sell?")).toBe("product");
  });

  it("routes general info queries to general", () => {
    expect(classifyQuery("What are your business hours?")).toBe("general");
    expect(classifyQuery("Where is your office located?")).toBe("general");
    expect(classifyQuery("How do I contact support?")).toBe("general");
    expect(classifyQuery("Tell me about your company")).toBe("general");
  });

  it("routes ambiguous queries to both", () => {
    expect(classifyQuery("Can you help me?")).toBe("both");
    expect(classifyQuery("I need more information")).toBe("both");
    expect(classifyQuery("Hello")).toBe("both");
  });

  it("routes vague high-intent buying signals to both knowledge stores", () => {
    expect(classifyQuery("Interested")).toBe("both");
    expect(classifyQuery("Pa info")).toBe("both");
    expect(classifyQuery("Send details")).toBe("both");
    expect(classifyQuery("HM?")).toBe("both");
    expect(classifyQuery("Available?")).toBe("both");
  });

  it("keeps availability and price questions product-oriented when product terms are clear", () => {
    expect(classifyQuery("Available pa yung blue widget?")).toBe("product");
    expect(classifyQuery("How much is the blue widget?")).toBe("product");
  });

  it("is case-insensitive", () => {
    expect(classifyQuery("WHAT IS THE PRICE")).toBe("product");
    expect(classifyQuery("WHERE ARE YOU LOCATED")).toBe("general");
  });

  it("handles empty or whitespace-only queries as both", () => {
    expect(classifyQuery("")).toBe("both");
    expect(classifyQuery("   ")).toBe("both");
  });

  it("routes product-specific terms to product", () => {
    expect(classifyQuery("Tell me about the blue widget")).toBe("product");
    expect(classifyQuery("Do you have this in stock?")).toBe("product");
    expect(classifyQuery("What colors are available?")).toBe("product");
    expect(classifyQuery("shipping options")).toBe("product");
  });

  it("routes FAQ-style queries to general", () => {
    expect(classifyQuery("What is your refund policy?")).toBe("general");
    expect(classifyQuery("Do you offer warranties?")).toBe("general");
    expect(classifyQuery("How does the process work?")).toBe("general");
  });
});

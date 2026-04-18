import { describe, it, expect } from "vitest";
import { serializeProduct } from "@/lib/ai/processors/product";

describe("serializeProduct", () => {
  it("serializes a full product into natural text", () => {
    const result = serializeProduct({
      name: "Premium Widget",
      price: 49.99,
      description: "A high-quality widget for professionals.",
      specs: { color: "Blue", weight: "200g" },
    });

    expect(result).toContain("Premium Widget");
    expect(result).toContain("49.99");
    expect(result).toContain("high-quality widget");
    expect(result).toContain("Blue");
    expect(result).toContain("200g");
  });

  it("handles product with only name and price", () => {
    const result = serializeProduct({ name: "Basic Item", price: 10 });
    expect(result).toContain("Basic Item");
    expect(result).toContain("10");
    expect(result).not.toContain("undefined");
  });

  it("includes category when provided", () => {
    const result = serializeProduct({ name: "Shoes", price: 80, category: "Footwear" });
    expect(result).toContain("Footwear");
  });

  it("serializes specs as key-value pairs", () => {
    const result = serializeProduct({
      name: "Gadget",
      price: 25,
      specs: { battery: "5000mAh", screen: "6.5 inch" },
    });
    expect(result).toContain("battery: 5000mAh");
    expect(result).toContain("screen: 6.5 inch");
  });

  it("throws if name is empty", () => {
    expect(() => serializeProduct({ name: "", price: 10 })).toThrow("Product name is required");
  });
});

import { describe, it, expect } from "vitest";
import { parseResponse } from "@/lib/ai/response-parser";

describe("parseResponse", () => {
  it("passes through a message with no SEND_IMAGE tokens", () => {
    const result = parseResponse("Here is our latest product!");
    expect(result.cleanMessage).toBe("Here is our latest product!");
    expect(result.extractedImageIds).toEqual([]);
  });

  it("extracts a single SEND_IMAGE token and removes it from text", () => {
    const result = parseResponse(
      "Check out this product! [SEND_IMAGE:550e8400-e29b-41d4-a716-446655440000]"
    );
    expect(result.cleanMessage).toBe("Check out this product!");
    expect(result.extractedImageIds).toEqual([
      "550e8400-e29b-41d4-a716-446655440000",
    ]);
  });

  it("extracts multiple SEND_IMAGE tokens", () => {
    const result = parseResponse(
      "Here are two options [SEND_IMAGE:aaa-bbb-ccc] and [SEND_IMAGE:ddd-eee-fff] for you."
    );
    expect(result.cleanMessage).toBe("Here are two options and for you.");
    expect(result.extractedImageIds).toEqual(["aaa-bbb-ccc", "ddd-eee-fff"]);
  });

  it("handles token at the start of the message", () => {
    const result = parseResponse(
      "[SEND_IMAGE:abc-123] Here is the item."
    );
    expect(result.cleanMessage).toBe("Here is the item.");
    expect(result.extractedImageIds).toEqual(["abc-123"]);
  });

  it("ignores malformed tokens (missing brackets, no ID)", () => {
    const result = parseResponse(
      "Check SEND_IMAGE:abc and [SEND_IMAGE:] too"
    );
    expect(result.cleanMessage).toBe("Check SEND_IMAGE:abc and [SEND_IMAGE:] too");
    expect(result.extractedImageIds).toEqual([]);
  });

  it("handles empty string input", () => {
    const result = parseResponse("");
    expect(result.cleanMessage).toBe("");
    expect(result.extractedImageIds).toEqual([]);
  });

  it("collapses extra whitespace after token removal", () => {
    const result = parseResponse(
      "Look at this  [SEND_IMAGE:img-1]  product"
    );
    expect(result.cleanMessage).toBe("Look at this product");
    expect(result.extractedImageIds).toEqual(["img-1"]);
  });

  it("deduplicates repeated image IDs", () => {
    const result = parseResponse(
      "[SEND_IMAGE:same-id] text [SEND_IMAGE:same-id]"
    );
    expect(result.cleanMessage).toBe("text");
    expect(result.extractedImageIds).toEqual(["same-id"]);
  });
});

import { describe, it, expect } from "vitest";
import { parseFbWebhook } from "@/lib/fb/webhook";

const FIXTURE_MESSAGE = {
  object: "page",
  entry: [
    {
      id: "111111111",
      time: 1713340000000,
      messaging: [
        {
          sender: { id: "psid-abc" },
          recipient: { id: "111111111" },
          timestamp: 1713340000000,
          message: {
            mid: "m_abc123",
            text: "Hello!",
          },
        },
      ],
    },
  ],
};

describe("parseFbWebhook", () => {
  it("parses a valid page webhook body", () => {
    const result = parseFbWebhook(FIXTURE_MESSAGE);
    expect(result).not.toBeNull();
    expect(result!.object).toBe("page");
    expect(result!.entry[0].messaging[0].sender.id).toBe("psid-abc");
  });

  it("returns null for non-page object", () => {
    expect(parseFbWebhook({ object: "user", entry: [] })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseFbWebhook(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseFbWebhook("not an object")).toBeNull();
  });
});

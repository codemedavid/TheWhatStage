import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

import { sendMessage } from "@/lib/fb/send";
import type { OutboundMessage } from "@/lib/fb/send";

describe("sendMessage with ImageMessage", () => {
  it("sends an image attachment with the correct payload structure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message_id: "mid-img-1" }),
    });

    const imageMsg: OutboundMessage = {
      type: "image",
      url: "https://res.cloudinary.com/example/image/upload/v1/whatstage/t1/knowledge/photo.jpg",
    };

    const result = await sendMessage("psid-123", imageMsg, "page-token");

    expect(result.messageId).toBe("mid-img-1");

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.message).toEqual({
      attachment: {
        type: "image",
        payload: {
          url: "https://res.cloudinary.com/example/image/upload/v1/whatstage/t1/knowledge/photo.jpg",
          is_reusable: true,
        },
      },
    });
    expect(callBody.recipient).toEqual({ id: "psid-123" });
  });

  it("throws on FB API error for image send", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Invalid URL" } }),
    });

    const imageMsg: OutboundMessage = {
      type: "image",
      url: "https://bad-url.com/img.jpg",
    };

    await expect(
      sendMessage("psid-123", imageMsg, "page-token")
    ).rejects.toThrow("FB Send API error");
  });
});

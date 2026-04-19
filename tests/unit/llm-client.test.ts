import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateResponse } from "@/lib/ai/llm-client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HUGGINGFACE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateResponse", () => {
  it("sends correct request format and returns response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: '{"message":"Hello!","phase_action":"stay","confidence":0.9,"image_ids":[]}' },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await generateResponse("You are helpful.", "Hi there");

    expect(result.content).toContain("Hello!");
    expect(result.finishReason).toBe("stop");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/chat/completions");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi there" },
    ]);
    expect(body.model).toBe("Qwen/Qwen3-8B-Instruct");
    expect(body.temperature).toBe(0.4);
    expect(body.max_tokens).toBe(512);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("uses custom config when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "response" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    await generateResponse("System", "User", {
      temperature: 0.3,
      topP: 0.8,
      maxTokens: 256,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.8);
    expect(body.max_tokens).toBe(256);
  });

  it("includes Authorization header with API key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
    });

    await generateResponse("System", "User");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-key");
  });

  it("throws on non-ok response after retries exhausted", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(generateResponse("System", "User")).rejects.toThrow(
      "HuggingFace text generation API error (500)"
    );
  });

  it("retries on 503 with backoff", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Model loading",
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "finally" }, finish_reason: "stop" }],
      }),
    });

    const result = await generateResponse("System", "User");

    expect(result.content).toBe("finally");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws when HUGGINGFACE_API_KEY is not set", async () => {
    vi.stubEnv("HUGGINGFACE_API_KEY", "");

    await expect(generateResponse("System", "User")).rejects.toThrow(
      "HUGGINGFACE_API_KEY is not set"
    );
  });

  it("throws after exhausting all retries on 503", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Model loading",
    });

    await expect(generateResponse("System", "User")).rejects.toThrow(
      "HuggingFace text generation API error (503)"
    );

    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("omits response_format when responseFormat is 'text'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "hours, open, schedule" }, finish_reason: "stop" }],
      }),
    });

    await generateResponse("System", "User", { responseFormat: "text" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.response_format).toBeUndefined();
  });
});

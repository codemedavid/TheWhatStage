import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/ai/chunking";

describe("chunkText", () => {
  it("returns the full text as one chunk when under the token limit", () => {
    const text = "This is a short paragraph about our services.";
    const chunks = chunkText(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits long text into multiple chunks with overlap", () => {
    const sentences = Array.from(
      { length: 150 },
      (_, i) => `Sentence number ${i} describes an important fact about the product.`
    );
    const text = sentences.join(" ");
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(3000);
    }
  });

  it("preserves overlap between consecutive chunks", () => {
    const sentences = Array.from(
      { length: 150 },
      (_, i) => `Unique sentence ${i} with specific content about topic ${i}.`
    );
    const text = sentences.join(" ");
    const chunks = chunkText(text);

    for (let i = 0; i < chunks.length - 1; i++) {
      const endWords = chunks[i].split(/\s+/).slice(-10);
      const startOfNext = chunks[i + 1];
      const hasOverlap = endWords.some((word) => startOfNext.startsWith(word) || startOfNext.includes(word));
      expect(hasOverlap).toBe(true);
    }
  });

  it("splits on sentence boundaries when possible", () => {
    const sentences = Array.from(
      { length: 100 },
      (_, i) => `This is sentence ${i}. It has two parts.`
    );
    const text = sentences.join(" ");
    const chunks = chunkText(text);

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      expect(trimmed).toMatch(/[.!?]$/);
    }
  });

  it("returns empty array for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText("\n\n")).toEqual([]);
  });

  it("handles text with no sentence boundaries gracefully", () => {
    const words = Array.from({ length: 800 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("accepts custom chunk size and overlap", () => {
    const sentences = Array.from(
      { length: 50 },
      (_, i) => `Sentence ${i} about the product.`
    );
    const text = sentences.join(" ");

    const smallChunks = chunkText(text, { maxTokens: 100, overlapTokens: 20 });
    const largeChunks = chunkText(text, { maxTokens: 1000, overlapTokens: 50 });

    expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
  });
});

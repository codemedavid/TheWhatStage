import { describe, it, expect } from "vitest";
import { __test__buildRetrievedKnowledge as render } from "@/lib/ai/prompt-builder";
import type { ChunkResult } from "@/lib/ai/vector-search";

describe("buildRetrievedKnowledge", () => {
  it("renders FAQ chunks with question label and doc title", () => {
    const chunks: ChunkResult[] = [{
      id: "c1",
      content: "Q: What's the price?\nA: PHP 4,999.",
      similarity: 0.9,
      metadata: { chunk_kind: "faq", qa_question: "What's the price?", doc_title: "Pricing FAQ", kb_type: "general" },
    }];
    const out = render(chunks);
    expect(out).toContain('[1] (FAQ · "Pricing FAQ" → "What\'s the price?")');
    expect(out).toContain("PHP 4,999");
  });

  it("falls back to doc title when no FAQ question", () => {
    const chunks: ChunkResult[] = [{
      id: "c1", content: "Body text", similarity: 0.7,
      metadata: { chunk_kind: "doc", doc_title: "Returns Policy" },
    }];
    const out = render(chunks);
    expect(out).toContain('[1] (Doc · "Returns Policy")');
  });
});

import type { ChunkResult } from "@/lib/ai/vector-search";

/** Substring-match faithfulness: does ANY retrieved chunk contain the expected fact? */
export function chunkContainsFact(chunks: ChunkResult[], fact: string): boolean {
  const needle = fact.toLowerCase().trim();
  return chunks.some((c) => c.content.toLowerCase().includes(needle));
}
